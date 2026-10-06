import { NextResponse } from "next/server";
import { getEmbeddingProvider } from "@/lib/ai/embeddings";
import { getAIProvider } from "@/lib/ai/provider";
import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";
import { ensureReady } from "@/lib/kb/bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public, secret-free status: never returns keys, connection strings or stack traces. */
export async function GET(): Promise<NextResponse> {
  const ai = getAIProvider();
  const status = {
    ok: true,
    ai: ai ? { configured: true, provider: ai.id, model: ai.model } : { configured: false, mode: "demo" },
    embeddings: { provider: env.EMBEDDING_PROVIDER, model: getEmbeddingProvider().id },
    database: { reachable: false, kind: null as string | null, entities: 0, chunks: 0, sources: 0, backlog: 0 },
  };
  try {
    await ensureReady();
    const db = await getDb();
    const rows = await db.query<{ e: number; c: number; s: number; b: number }>(
      "select (select count(*) from entities)::int as e, (select count(*) from chunks)::int as c, (select count(*) from sources)::int as s, (select count(*) from kb_backlog)::int as b",
    );
    const row = rows[0];
    status.database = { reachable: true, kind: db.kind, entities: row?.e ?? 0, chunks: row?.c ?? 0, sources: row?.s ?? 0, backlog: row?.b ?? 0 };
  } catch {
    status.ok = false;
  }
  return NextResponse.json(status, { status: status.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
