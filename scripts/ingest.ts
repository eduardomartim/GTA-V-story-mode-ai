import "./_boot";
import { closeDb, getDb, runMigrations } from "@/lib/db/client";
import { ingestKnowledgeBase } from "@/lib/kb/ingest";
import { loadKnowledgeBase } from "@/lib/kb/load";
import { validateKnowledgeBase } from "@/lib/kb/quality";

const kb = loadKnowledgeBase();
const errors = validateKnowledgeBase(kb).filter((i) => i.level === "error");
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e.entity ?? "-"}: ${e.message}`);
  process.exit(1);
}
const db = await getDb();
await runMigrations(db);
const res = await ingestKnowledgeBase(db, kb);
console.log(`Ingested ${res.entities} entities → ${res.chunks} chunks (${res.embeddingModel}) in ${res.ms} ms [${db.kind}]`);
await closeDb();
