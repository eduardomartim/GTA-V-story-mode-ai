import "./_boot";
import { closeDb } from "@/lib/db/client";
import { ensureReady } from "@/lib/kb/bootstrap";
import { runChat } from "@/lib/rag/pipeline";
await ensureReady();
const q = process.argv[2] ?? "";
await runChat({ message: q, provider: null, onTrace: (t) => { for (const c of t.context) console.log(c.score.toFixed(2), c.entityId, c.contentType, "|", c.content.slice(0, 90).replace(/\n/g, " ")); } });
await closeDb();
