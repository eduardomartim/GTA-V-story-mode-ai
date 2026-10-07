import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AIProvider } from "@/lib/ai/provider";
import { runChat } from "@/lib/rag/pipeline";
import type { Candidate, ChatResult, ChatTurn } from "@/lib/rag/types";
import { isSafeExternalUrl } from "@/lib/security/url";
import { normalize } from "@/lib/text";

/**
 * Agent evaluation (v2): real player questions by difficulty — easy, medium, hard, composed, adversarial —
 * run through the full pipeline. Expectations are written as data (expected goal / mode / entities / facts /
 * forbidden claims), so a pass can only come from the knowledge base and the retrieval, never from special-casing.
 */
export const AgentQuestion = z.object({
  id: z.string(),
  level: z.enum(["easy", "medium", "hard", "composed", "adversarial"]),
  q: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string(), entities: z.array(z.string()).optional() })).optional(),
  expect: z.object({
    /** Planner goal ("none" = no plan). */
    goal: z.string().optional(),
    /** Accepted answer modes (llm/demo count as one: "generated"). */
    mode: z.array(z.string()).optional(),
    /** Entity ids that must be resolved and retrieved. */
    entities: z.array(z.string()).default([]),
    /** Id prefixes that count as relevant context (for precision). */
    relevant: z.array(z.string()).default([]),
    /** Regexes (case-insensitive) that the answer + cards must contain. */
    facts: z.array(z.string()).default([]),
    /** Regexes the ANSWER must contain that are phrasing or derived values, not KB facts (refusals, distances…). */
    phrasing: z.array(z.string()).default([]),
    /** Regexes that must NOT appear (invented facts, Online content, wrong claims). */
    forbidden: z.array(z.string()).default([]),
    /** true = the question is about GTA Online content and must get the Story-Mode boundary notice. */
    online: z.boolean().default(false),
  }),
});
export type AgentQuestion = z.infer<typeof AgentQuestion>;

export const loadAgentQuestions = (file = path.join(process.cwd(), "eval", "agent-questions.json")): AgentQuestion[] =>
  z.array(AgentQuestion).parse(JSON.parse(fs.readFileSync(file, "utf8")));

export interface AgentCaseResult {
  id: string;
  level: AgentQuestion["level"];
  q: string;
  pass: boolean;
  mode: string;
  goal: string | null;
  failures: string[];
  scores: { goal?: boolean; entity: number; recall: number; precision: number; grounded: number; complete: number; cited: boolean; hallucinated: boolean; contaminated: boolean };
  latencyMs: number;
}

export interface AgentReport {
  generatedAt: string;
  provider: string;
  total: number;
  passed: number;
  byLevel: Record<string, { total: number; passed: number }>;
  metrics: {
    goalAccuracy: number; entityResolution: number; retrievalRecall: number; precision: number; groundedness: number;
    citationCorrectness: number; completeness: number; hallucinationRate: number; onlineContaminationRate: number; meanLatencyMs: number;
  };
  cases: AgentCaseResult[];
}

const cardText = (r: ChatResult) => JSON.stringify(r.cards);
const re = (s: string) => new RegExp(s, "i");

export async function evaluateAgent(questions: AgentQuestion[], opts: { provider?: AIProvider | null; onlineTerms: string[] }): Promise<AgentReport> {
  const cases: AgentCaseResult[] = [];
  const onlineRes = opts.onlineTerms.map(normalize).filter((t) => t.length >= 5);
  for (const q of questions) {
    let context: Candidate[] = [];
    let analysisEntities: string[] = [];
    const r = await runChat({ message: q.q, history: (q.history ?? []) as ChatTurn[], provider: opts.provider ?? null, onTrace: (t) => {
      context = t.context;
      analysisEntities = [...t.analysis.entities, ...t.analysis.inheritedEntities].map((e) => e.id);
    } });
    const e = q.expect;
    const failures: string[] = [];
    const answerAll = `${r.answer}\n${cardText(r)}`;
    const ctxText = context.map((c) => c.content).join("\n");
    const ctxIds = new Set(context.map((c) => c.entityId));
    const mode = r.mode === "llm" || r.mode === "demo" ? "generated" : r.mode;

    const goal = r.meta.plan?.goal ?? null;
    const goalOk = e.goal === undefined ? undefined : (e.goal === "none" ? goal === null : goal === e.goal);
    if (goalOk === false) failures.push(`goal ${goal} ≠ ${e.goal}`);
    if (e.mode && !e.mode.includes(mode)) failures.push(`mode ${mode} ∉ ${e.mode.join("|")}`);

    const resolved = new Set([...analysisEntities, ...r.meta.entities, ...r.cards.map((c) => ("entityId" in c ? c.entityId : "")).filter(Boolean)]);
    const entityHits = e.entities.filter((id) => resolved.has(id) || ctxIds.has(id)).length;
    const entity = e.entities.length ? entityHits / e.entities.length : 1;
    if (entity < 1) failures.push(`entities missing: ${e.entities.filter((id) => !(resolved.has(id) || ctxIds.has(id))).join(", ")}`);
    const recall = e.entities.length ? e.entities.filter((id) => ctxIds.has(id)).length / e.entities.length : 1;
    const relevantPrefixes = [...e.entities, ...e.relevant];
    const precision = context.length ? context.filter((c) => relevantPrefixes.some((p) => c.entityId.startsWith(p))).length / context.length : (e.entities.length ? 0 : 1);

    const factIn = (text: string) => e.facts.filter((f) => re(f).test(text)).length / (e.facts.length || 1);
    const grounded = e.facts.length ? factIn(ctxText) : 1;
    const expectedInAnswer = [...e.facts, ...e.phrasing];
    const complete = expectedInAnswer.length ? expectedInAnswer.filter((f) => re(f).test(answerAll)).length / expectedInAnswer.length : 1;
    if (complete < 1) failures.push(`missing in answer: ${expectedInAnswer.filter((f) => !re(f).test(answerAll)).join(" | ")}`);
    const hallucinated = e.forbidden.some((f) => re(f).test(r.answer));
    if (hallucinated) failures.push(`forbidden claim present: ${e.forbidden.filter((f) => re(f).test(r.answer)).join(" | ")}`);

    // Citation correctness: no unresolved markers, every source https + allow-listed, and an evidence-backed answer cites ≥1 source.
    const stray = /\[S\d+\]/.test(r.answer);
    const badUrl = r.sources.some((s) => !isSafeExternalUrl(s.url));
    const needsSources = ["generated", "structured"].includes(mode);
    const cited = !stray && !badUrl && (!needsSources || r.sources.length > 0);
    if (!cited) failures.push(`citation problem (stray ${stray}, bad url ${badUrl}, sources ${r.sources.length})`);

    // Online contamination: a Story Mode answer that presents Online-only content; or an Online question answered as Story Mode.
    const answerNorm = normalize(r.answer);
    const mentionsOnline = onlineRes.filter((t) => answerNorm.includes(t));
    const contaminated = e.online
      ? !(r.mode === "online-boundary" || /gta online/i.test(r.answer))
      : mentionsOnline.length > 0 && !/gta online|online only|somente no online|nao (e|pertence)/i.test(answerNorm);
    if (contaminated) failures.push(e.online ? "Online question answered as Story Mode" : `Online-only content in a Story answer: ${mentionsOnline.join(", ")}`);

    cases.push({ id: q.id, level: q.level, q: q.q, pass: failures.length === 0, mode, goal, failures,
      scores: { goal: goalOk, entity, recall, precision, grounded, complete, cited, hallucinated, contaminated }, latencyMs: r.meta.latencyMs });
  }
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
  const withGoal = cases.filter((c) => c.scores.goal !== undefined);
  const byLevel: AgentReport["byLevel"] = {};
  for (const c of cases) {
    byLevel[c.level] ??= { total: 0, passed: 0 };
    byLevel[c.level]!.total++;
    if (c.pass) byLevel[c.level]!.passed++;
  }
  return {
    generatedAt: new Date().toISOString(),
    provider: opts.provider ? `${opts.provider.id}/${opts.provider.model}` : "none (demo mode — deterministic pipeline, no LLM)",
    total: cases.length,
    passed: cases.filter((c) => c.pass).length,
    byLevel,
    metrics: {
      goalAccuracy: avg(withGoal.map((c) => (c.scores.goal ? 1 : 0))),
      entityResolution: avg(cases.map((c) => c.scores.entity)),
      retrievalRecall: avg(cases.map((c) => c.scores.recall)),
      precision: avg(cases.map((c) => c.scores.precision)),
      groundedness: avg(cases.map((c) => c.scores.grounded)),
      citationCorrectness: avg(cases.map((c) => (c.scores.cited ? 1 : 0))),
      completeness: avg(cases.map((c) => c.scores.complete)),
      hallucinationRate: avg(cases.map((c) => (c.scores.hallucinated ? 1 : 0))),
      onlineContaminationRate: avg(cases.map((c) => (c.scores.contaminated ? 1 : 0))),
      meanLatencyMs: Math.round(avg(cases.map((c) => c.latencyMs))),
    },
    cases,
  };
}
