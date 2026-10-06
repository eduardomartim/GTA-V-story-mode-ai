import "./_boot";
import fs from "node:fs";
import { closeDb } from "@/lib/db/client";
import { evaluateRetrieval, loadGold } from "@/lib/eval/retrieval";
import { ensureReady } from "@/lib/kb/bootstrap";

/** `npm run evaluate:retrieval` — held-out retrieval/grounding report (no LLM needed). */
await ensureReady();
const report = await evaluateRetrieval(loadGold());
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Retrieval evaluation on ${report.n} held-out questions`);
for (const [k, v] of Object.entries(report.metrics)) console.log(`  ${k.padEnd(18)} ${k === "mrr" ? v.toFixed(3) : pct(v)}`);
for (const w of report.worst) console.log(`  ✗ ${w.id} ${w.q}\n      ${w.issue}`);
fs.writeFileSync("eval/retrieval-report.json", JSON.stringify(report, null, 2));
await closeDb();
