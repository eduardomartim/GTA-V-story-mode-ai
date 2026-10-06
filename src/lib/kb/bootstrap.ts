import { getDb, runMigrations } from "@/lib/db/client";
import { log } from "@/lib/log";
import { ingestKnowledgeBase } from "./ingest";
import { loadKnowledgeBase } from "./load";
import { validateKnowledgeBase } from "./quality";

const g = globalThis as unknown as { __gtaReady?: Promise<void> };

/**
 * Makes the app usable on first run. Migrations always run (idempotent). The knowledge base is auto-ingested
 * ONLY for the embedded PGlite database when it is empty. A remote Postgres/Supabase is never modified
 * implicitly: run `npm run db:seed` for that.
 */
export function ensureReady(): Promise<void> {
  if (!g.__gtaReady) {
    g.__gtaReady = (async () => {
      const db = await getDb();
      await runMigrations(db);
      const rows = await db.query<{ n: number | string }>("select count(*)::int as n from entities");
      if (Number(rows[0]?.n ?? 0) === 0) {
        if (db.kind !== "pglite") throw new Error("Knowledge base is empty. Run `npm run db:seed`.");
        const kb = loadKnowledgeBase();
        const errors = validateKnowledgeBase(kb).filter((i) => i.level === "error");
        if (errors.length) throw new Error(`Knowledge base failed validation: ${errors[0]?.message}`);
        const res = await ingestKnowledgeBase(db, kb);
        log("info", "auto_seeded", { entities: res.entities, chunks: res.chunks, ms: res.ms });
      }
    })().catch((err) => {
      g.__gtaReady = undefined;
      throw err;
    });
  }
  return g.__gtaReady;
}
