import { beforeAll, expect, it } from "vitest";
import { loadQuestions, runEval, type EvalReport } from "@/lib/eval/run";
import { readyDb } from "../helpers";

let report: EvalReport;
const questions = loadQuestions();

beforeAll(async () => {
  await readyDb();
  report = await runEval(questions, null);
}, 180_000);

it("the evaluation set has at least 100 questions with the required per-category minimums", () => {
  expect(questions.length).toBeGreaterThanOrEqual(100);
  const count = (c: string) => questions.filter((q) => q.category === c).length;
  const minimums: Record<string, number> = { missions: 20, heists: 15, characters: 10, vehicles: 10, weapons: 10, collectibles: 10, locations: 10, "100%": 10, troubleshooting: 5, "version differences": 5 };
  for (const [cat, n] of Object.entries(minimums)) expect(count(cat), `category ${cat}`).toBeGreaterThanOrEqual(n);
  expect(count("groundedness")).toBeGreaterThanOrEqual(5);
  expect(count("story vs online")).toBeGreaterThanOrEqual(5);
  expect(questions.every((q) => "expected_entities" in q && "expected_sources" in q && "expected_answer_facts" in q)).toBe(true);
});

it("meets the quality gate: ≥ 90% of questions pass end to end", () => {
  const failures = report.outcomes.filter((o) => !o.pass).map((o) => `${o.id}: ${o.failures.join("; ")}`);
  expect(failures).toEqual([]);
  expect(report.passRate).toBeGreaterThanOrEqual(0.9);
});

it("has high entity, source and fact recall", () => {
  expect(report.entityRecall).toBeGreaterThanOrEqual(0.95);
  expect(report.sourceRecall).toBeGreaterThanOrEqual(0.95);
  expect(report.factRecall).toBeGreaterThanOrEqual(0.95);
});

it("never leaks Online-only content into Story Mode questions", async () => {
  const { runChat } = await import("@/lib/rag/pipeline");
  for (const q of questions.filter((x) => x.expect === "answer").slice(0, 25)) {
    const ids: string[] = [];
    await runChat({ message: q.question, provider: null, onTrace: (t) => ids.push(...t.context.map((c) => c.entityId)) });
    expect(ids.filter((id) => id.startsWith("online_boundary:")), q.id).toEqual([]);
  }
});
