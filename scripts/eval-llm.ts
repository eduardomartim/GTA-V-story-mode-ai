import "./_boot";
import fs from "node:fs";
import { getAIProvider } from "@/lib/ai/provider";
import { closeDb } from "@/lib/db/client";
import { loadLlmQuestions, runLlmEval } from "@/lib/eval/llm";
import { ensureReady } from "@/lib/kb/bootstrap";

/**
 * `npm run evaluate:llm`: real-model evaluation (54 questions, 7 judged dimensions + deterministic checks).
 * Needs ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_API_KEY. Without a key it records status "not_run" and exits 0:
 * it never fabricates results.
 */
const provider = getAIProvider();
if (!provider) {
  fs.writeFileSync("eval/llm-report.json", JSON.stringify({ status: "not_run", reason: "No AI provider key configured in the environment", at: new Date().toISOString() }, null, 2));
  console.log("LLM evaluation NOT run: no AI provider key is configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY or GOOGLE_API_KEY).");
  process.exit(0);
}
await ensureReady();
const report = await runLlmEval(loadLlmQuestions(), provider);
fs.writeFileSync("eval/llm-report.json", JSON.stringify(report, null, 2));
console.log(`LLM evaluation: ${report.provider}/${report.model}, judge ${report.judge}, ${report.n} questions`);
console.log(`Overall grade ${report.overall}/100, deterministic checks passed ${(report.deterministicPassRate * 100).toFixed(0)}%`);
for (const [d, v] of Object.entries(report.dimensions)) console.log(`  ${d.padEnd(26)} ${v.toFixed(2)} / 5`);
for (const [c, v] of Object.entries(report.byCategory)) console.log(`  [${c}] ${v}`);
for (const l of report.lowest) console.log(`  low: ${l.id} ${l.grade} ${l.comment}`);
await closeDb();
