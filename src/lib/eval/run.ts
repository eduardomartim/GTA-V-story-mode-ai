import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AIProvider } from "@/lib/ai/provider";
import { runChat } from "@/lib/rag/pipeline";
import type { Candidate, ChatResult, ChatTurn } from "@/lib/rag/types";
import { normalize } from "@/lib/text";

const Question = z.object({
  id: z.string(),
  category: z.string(),
  question: z.string(),
  previous: z.array(z.string()).optional(),
  expect: z.enum(["answer", "unvalidated", "no-evidence", "online-boundary"]).default("answer"),
  expect_spoiler: z.boolean().optional(),
  expected_entities: z.array(z.string()),
  expected_sources: z.array(z.string()),
  expected_answer_facts: z.array(z.string()),
  expected_cards: z.array(z.string()).optional(),
  /** Question terms that the knowledge base cannot cover; they must be flagged to the generator (partial-evidence guard). */
  expect_unmatched: z.array(z.string()).optional(),
});
export type EvalQuestion = z.infer<typeof Question>;

export interface EvalOutcome {
  id: string;
  category: string;
  question: string;
  pass: boolean;
  mode: ChatResult["mode"];
  failures: string[];
  entityRecall: number;
  sourceRecall: number;
  factRecall: number;
}

export interface EvalReport {
  total: number;
  passed: number;
  passRate: number;
  entityRecall: number;
  sourceRecall: number;
  factRecall: number;
  byCategory: Record<string, { total: number; passed: number }>;
  outcomes: EvalOutcome[];
}

export function loadQuestions(file = path.join(process.cwd(), "eval", "questions.json")): EvalQuestion[] {
  return z.array(Question).parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);
const recall = (expected: string[], found: (x: string) => boolean) => (expected.length ? expected.filter(found).length / expected.length : 1);

/**
 * Runs the full pipeline for every question and scores it against the KB-grounded expectations:
 *  - entity recall   : expected entities appear in the retrieved context / answer focus,
 *  - source recall   : expected source ids appear among the context sources,
 *  - fact recall     : expected facts appear in the context or in the generated answer,
 *  - behaviour       : refuses out-of-scope, flags "not validated", and keeps Online content out.
 * Facts are checked against what the KNOWLEDGE BASE asserts (groundedness), not against external truth.
 */
export async function runEval(questions: EvalQuestion[], provider?: AIProvider | null): Promise<EvalReport> {
  const outcomes: EvalOutcome[] = [];
  for (const q of questions) {
    const history: ChatTurn[] = [];
    for (const prev of q.previous ?? []) {
      const r = await runChat({ message: prev, history, provider });
      history.push({ role: "user", content: prev }, { role: "assistant", content: r.answer, entities: r.meta.entities });
    }
    let context: Candidate[] = [];
    const result = await runChat({ message: q.question, history, provider, onTrace: (t) => { context = t.context; } });
    const haystack = normalize([...context.map((c) => c.content), result.answer].join(" \n "));
    const failures: string[] = [];

    const ctxEntities = new Set([...context.map((c) => c.entityId), ...result.meta.entities]);
    const entityRecall = recall(q.expected_entities, (e) => ctxEntities.has(e));
    const ctxSources = new Set(context.map((c) => c.sourceId));
    const sourceRecall = recall(q.expected_sources, (s) => ctxSources.has(s));
    const factRecall = recall(q.expected_answer_facts, (f) => haystack.includes(normalize(f)));

    switch (q.expect) {
      case "no-evidence":
        if (result.mode !== "no-evidence") failures.push(`expected no-evidence, got ${result.mode}`);
        break;
      case "online-boundary":
        if (result.mode !== "online-boundary") failures.push(`expected online-boundary, got ${result.mode}`);
        break;
      case "unvalidated": {
        const flagged = result.mode === "no-evidence" || (result.meta.gaps?.length ?? 0) > 0 || /not (yet )?validated|ainda nao validad|nao validad/.test(haystack);
        if (!flagged) failures.push("expected an explicit 'not validated' / no-evidence response");
        if (result.mode === "online-boundary") failures.push("unexpected online-boundary");
        break;
      }
      default:
        if (result.mode === "no-evidence" || result.mode === "online-boundary") failures.push(`expected an answer, got ${result.mode}`);
    }
    if (q.expect === "answer" || q.expect === "unvalidated" || q.expect === "online-boundary") {
      if (entityRecall < 1 && q.expect !== "online-boundary") failures.push(`entities missing: ${q.expected_entities.filter((e) => !ctxEntities.has(e)).join(", ")}`);
      if (sourceRecall < 1) failures.push(`sources missing: ${q.expected_sources.filter((s) => !ctxSources.has(s)).join(", ")}`);
      if (factRecall < 1) failures.push(`facts missing: ${q.expected_answer_facts.filter((f) => !haystack.includes(normalize(f))).join(", ")}`);
    }
    if (q.expected_cards) {
      const kinds = new Set(result.cards.map((c) => c.kind));
      const missing = q.expected_cards.filter((k) => !kinds.has(k as never));
      if (missing.length) failures.push(`cards missing: ${missing.join(", ")}`);
    }
    if (q.expect_unmatched) {
      const flagged = new Set(result.meta.unmatchedTerms ?? []);
      const missing = q.expect_unmatched.filter((w) => !flagged.has(w));
      if (missing.length) failures.push(`terms not flagged as unmatched: ${missing.join(", ")}`);
    }
    if (q.expect_spoiler !== undefined && result.spoiler !== q.expect_spoiler) failures.push(`spoiler flag expected ${q.expect_spoiler}`);

    outcomes.push({ id: q.id, category: q.category, question: q.question, pass: failures.length === 0, mode: result.mode, failures, entityRecall, sourceRecall, factRecall });
  }

  const byCategory: EvalReport["byCategory"] = {};
  for (const o of outcomes) {
    const c = (byCategory[o.category] ??= { total: 0, passed: 0 });
    c.total++;
    if (o.pass) c.passed++;
  }
  const passed = outcomes.filter((o) => o.pass).length;
  return {
    total: outcomes.length, passed, passRate: passed / (outcomes.length || 1),
    entityRecall: mean(outcomes.map((o) => o.entityRecall)), sourceRecall: mean(outcomes.map((o) => o.sourceRecall)), factRecall: mean(outcomes.map((o) => o.factRecall)),
    byCategory, outcomes,
  };
}
