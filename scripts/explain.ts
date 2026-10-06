import "./_boot";
import { getDb, closeDb } from "@/lib/db/client";
import { ensureReady } from "@/lib/kb/bootstrap";
import { analyzeQuery } from "@/lib/rag/understanding";
import { hybridRetrieve, rerank } from "@/lib/rag/retrieval";
import { structuredLookups } from "@/lib/rag/structured";
await ensureReady();
const db = await getDb();
for (const q of process.argv.slice(2)) {
  const a = await analyzeQuery(q);
  console.log("\n##", q, a.intents, a.entities.map((e) => e.id));
  const r = await hybridRetrieve(db, a);
  const l = await structuredLookups(db, a);
  for (const c of rerank([...l, ...r.candidates], a.intents, a.original).slice(0, 20)) console.log(c.score.toFixed(3), c.entityId, c.contentType, "sem", c.semantic.toFixed(2), "kw", c.keyword.toFixed(2), "ent", c.entityScore, c.via.join("+"));
}
await closeDb();
