import "./_boot";
import fs from "node:fs";
import { closeDb } from "@/lib/db/client";
import { loadQuestions, runEval } from "@/lib/eval/run";
import { ensureReady } from "@/lib/kb/bootstrap";

/** `npm run eval` — runs the evaluation set through the real pipeline (real AI provider when configured, otherwise demo). */
await ensureReady();
const report = await runEval(loadQuestions());
console.log("\nCategory".padEnd(26) + "passed");
for (const [cat, v] of Object.entries(report.byCategory)) console.log(`  ${cat.padEnd(24)}${v.passed}/${v.total}`);
for (const o of report.outcomes.filter((x) => !x.pass)) console.log(`\n✗ ${o.id} [${o.mode}] ${o.question}\n    ${o.failures.join("\n    ")}`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`\nPass rate ${report.passed}/${report.total} (${pct(report.passRate)}) · entity recall ${pct(report.entityRecall)} · source recall ${pct(report.sourceRecall)} · fact recall ${pct(report.factRecall)}`);
fs.writeFileSync("eval/report.json", JSON.stringify(report, null, 2));
await closeDb();
process.exit(report.passRate >= 0.9 ? 0 : 1);
