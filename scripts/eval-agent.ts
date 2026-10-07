// `npm run evaluate:agent` — v2 agent evaluation (easy / medium / hard / composed / adversarial). Writes eval/agent-report.json.
import "./_boot";
import fs from "node:fs";
import path from "node:path";
import { getAIProvider } from "@/lib/ai/provider";
import { closeDb, getDb } from "@/lib/db/client";
import { evaluateAgent, loadAgentQuestions } from "@/lib/eval/agent";
import { ensureReady } from "@/lib/kb/bootstrap";

await ensureReady();
const db = await getDb();
const onlineTerms = (await db.query<{ alias: string }>("select a.alias from aliases a join entities e on e.id = a.entity_id where e.online_only")).map((r) => r.alias);
const provider = process.argv.includes("--llm") ? getAIProvider() : null;
const report = await evaluateAgent(loadAgentQuestions(), { provider, onlineTerms });
fs.writeFileSync(path.join(process.cwd(), "eval", "agent-report.json"), `${JSON.stringify(report, null, 1)}\n`);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`Agent evaluation — ${report.passed}/${report.total} passed · provider: ${report.provider}`);
for (const [level, s] of Object.entries(report.byLevel)) console.log(`  ${level.padEnd(12)} ${s.passed}/${s.total}`);
const m = report.metrics;
console.log(`  goal accuracy ${pct(m.goalAccuracy)} · entity resolution ${pct(m.entityResolution)} · retrieval recall ${pct(m.retrievalRecall)} · precision ${pct(m.precision)}`);
console.log(`  groundedness ${pct(m.groundedness)} · citation correctness ${pct(m.citationCorrectness)} · completeness ${pct(m.completeness)}`);
console.log(`  hallucination rate ${pct(m.hallucinationRate)} · Online contamination rate ${pct(m.onlineContaminationRate)} · mean latency ${m.meanLatencyMs} ms`);
for (const c of report.cases.filter((x) => !x.pass)) console.log(`  ✗ ${c.id} [${c.level}] ${c.q}\n      ${c.failures.join("\n      ")}`);
await closeDb();
