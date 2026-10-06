import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AIProvider } from "@/lib/ai/provider";
import { runChat } from "@/lib/rag/pipeline";
import type { Candidate, ChatResult, ChatTurn } from "@/lib/rag/types";
import { isSafeExternalUrl } from "@/lib/security/url";
import { normalize } from "@/lib/text";

const Q = z.object({
  id: z.string(),
  category: z.string(),
  question: z.string(),
  history: z.array(z.string()).optional(),
  expect: z.enum(["answer", "refuse", "gap", "clarify", "online"]),
  must_include: z.array(z.string()),
  must_not_include: z.array(z.string()),
  notes: z.string(),
});
export type LlmQuestion = z.infer<typeof Q>;
export const loadLlmQuestions = (file = path.join(process.cwd(), "eval", "llm-questions.json")): LlmQuestion[] => z.array(Q).parse(JSON.parse(fs.readFileSync(file, "utf8")));

export const DIMENSIONS = ["factuality", "groundedness", "relevance", "completeness", "source_attribution", "story_mode_correctness", "hallucination_resistance"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Scores = Record<Dimension, number>;

export interface LlmRow {
  id: string;
  category: string;
  question: string;
  mode: ChatResult["mode"];
  answer: string;
  scores: Scores | null;
  judgeComment: string;
  checks: Record<string, boolean>;
  deterministicPass: boolean;
  grade: number; // 0..100
}

export interface LlmReport {
  status: "ok" | "not_run";
  provider?: string;
  model?: string;
  judge?: string;
  n: number;
  overall: number;
  deterministicPassRate: number;
  dimensions: Record<Dimension, number>;
  byCategory: Record<string, number>;
  lowest: Array<{ id: string; grade: number; comment: string }>;
  rows: LlmRow[];
}

export const JUDGE_SYSTEM = `You are a strict evaluator of a domain-specific assistant for Grand Theft Auto V STORY MODE.
You receive a QUESTION, the CONTEXT the assistant was given (its only allowed evidence), the assistant's ANSWER, the expected behaviour and notes.
Score each dimension from 1 (very bad) to 5 (excellent):
- factuality: every claim is true according to the CONTEXT (no invented facts, numbers or locations)
- groundedness: claims are supported by the CONTEXT and cited; unsupported claims are absent
- relevance: answers what was asked, in the user's language, with the right level of detail
- completeness: covers what the CONTEXT allows for this question (do not penalise missing facts that the CONTEXT lacks)
- source_attribution: citations are present where needed and point to blocks that really support the statements
- story_mode_correctness: treats Story Mode correctly; flags GTA Online content instead of mixing it in; handles version scope and spoilers properly
- hallucination_resistance: when evidence is missing or sources conflict, says so instead of guessing; asks for clarification when the question is ambiguous
Return ONLY compact JSON: {"factuality":n,"groundedness":n,"relevance":n,"completeness":n,"source_attribution":n,"story_mode_correctness":n,"hallucination_resistance":n,"comment":"one sentence"}.`;

export function parseScores(text: string): { scores: Scores; comment: string } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const scores = {} as Scores;
    for (const d of DIMENSIONS) {
      const v = Number(j[d]);
      if (!Number.isFinite(v) || v < 1 || v > 5) return null;
      scores[d] = v;
    }
    return { scores, comment: String(j.comment ?? "") };
  } catch {
    return null;
  }
}

const REFUSAL = /n[aã]o encontrei evid[eê]ncia|n[aã]o est[aá] validad|not validated|couldn.?t find enough evidence|n[aã]o tenho (evid[eê]ncia|informa)|no evidence/i;

export function deterministic(q: LlmQuestion, r: ChatResult, ctx: Candidate[]): Record<string, boolean> {
  const text = normalize(r.answer);
  const checks: Record<string, boolean> = {};
  checks.must_include = q.must_include.every((s) => text.includes(normalize(s)));
  checks.must_not_include = q.must_not_include.every((s) => !text.includes(normalize(s)));
  const hedges = r.mode === "no-evidence" || (r.meta.gaps?.length ?? 0) > 0 || REFUSAL.test(r.answer);
  switch (q.expect) {
    case "online": checks.behaviour = r.mode === "online-boundary" || /gta online/i.test(r.answer); break;
    case "clarify": checks.behaviour = r.mode === "clarify" || (/\?/.test(r.answer) && /(qual|which|what)/i.test(r.answer)); break;
    case "refuse": checks.behaviour = r.mode === "no-evidence" || REFUSAL.test(r.answer); break;
    case "gap": checks.behaviour = hedges; break;
    default: checks.behaviour = r.mode !== "no-evidence" && r.mode !== "online-boundary";
  }
  // Source discipline: only allow-listed URLs, and every source must be backed by a context block of that entity.
  const ctxEntities = new Set(ctx.map((c) => c.entityId));
  checks.sources_safe = r.sources.every((s) => isSafeExternalUrl(s.url));
  checks.sources_supported = r.sources.every((s) => ctxEntities.has(s.entityId));
  checks.sources_present = q.expect !== "answer" || r.mode === "structured" || r.sources.length > 0;
  return checks;
}

/**
 * LLM evaluation: runs the real pipeline with a real provider, then (a) applies deterministic checks and
 * (b) asks a judge model to score seven dimensions 1-5. The judge defaults to the same provider, which is a known bias;
 * pass a different `judge` to avoid self-grading. This is an INTERNAL evaluation, not an external benchmark.
 */
export async function runLlmEval(questions: LlmQuestion[], provider: AIProvider, judge: AIProvider = provider): Promise<LlmReport> {
  const rows: LlmRow[] = [];
  for (const q of questions) {
    const history: ChatTurn[] = [];
    for (const prev of q.history ?? []) {
      const r = await runChat({ message: prev, history, provider });
      history.push({ role: "user", content: prev }, { role: "assistant", content: r.answer, entities: r.meta.entities });
    }
    let ctx: Candidate[] = [];
    const result = await runChat({ message: q.question, history, provider, onTrace: (t) => { ctx = t.context; } });
    const checks = deterministic(q, result, ctx);
    const deterministicPass = Object.values(checks).every(Boolean);

    let scores: Scores | null = null;
    let comment = "";
    try {
      const out = await judge.generate({
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: JSON.stringify({ question: q.question, expected_behaviour: q.expect, notes: q.notes, context: ctx.map((c, i) => `[S${i + 1}] (${c.entityName}; status ${c.verification}) ${c.content.slice(0, 700)}`), answer: result.answer }) }],
        maxTokens: 400,
        temperature: 0,
      });
      const parsed = parseScores(out.text);
      if (parsed) {
        scores = parsed.scores;
        comment = parsed.comment;
      }
    } catch {
      comment = "judge unavailable";
    }
    const judgeScore = scores ? (DIMENSIONS.reduce((s, d) => s + (scores as Scores)[d], 0) / DIMENSIONS.length - 1) / 4 : 0;
    // Grade = 70% judge + 30% deterministic checks (fraction passed).
    const detValues = Object.values(checks);
    const detFrac = detValues.filter(Boolean).length / detValues.length;
    rows.push({ id: q.id, category: q.category, question: q.question, mode: result.mode, answer: result.answer, scores, judgeComment: comment, checks, deterministicPass, grade: Math.round((0.7 * judgeScore + 0.3 * detFrac) * 100) });
  }
  return summarize(rows, provider, judge);
}

export function summarize(rows: LlmRow[], provider: AIProvider, judge: AIProvider): LlmReport {
  const scored = rows.filter((r) => r.scores);
  const dim = (d: Dimension) => (scored.length ? scored.reduce((s, r) => s + (r.scores as Scores)[d], 0) / scored.length : 0);
  const cats: Record<string, number[]> = {};
  for (const r of rows) (cats[r.category] ??= []).push(r.grade);
  return {
    status: "ok", provider: provider.id, model: provider.model, judge: `${judge.id}:${judge.model}`, n: rows.length,
    overall: Math.round(rows.reduce((s, r) => s + r.grade, 0) / (rows.length || 1)),
    deterministicPassRate: rows.filter((r) => r.deterministicPass).length / (rows.length || 1),
    dimensions: Object.fromEntries(DIMENSIONS.map((d) => [d, Number(dim(d).toFixed(2))])) as Record<Dimension, number>,
    byCategory: Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, Math.round(v.reduce((a, b) => a + b, 0) / v.length)])),
    lowest: [...rows].sort((a, b) => a.grade - b.grade).slice(0, 8).map((r) => ({ id: r.id, grade: r.grade, comment: r.judgeComment })),
    rows,
  };
}
