import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { ensureReady } from "@/lib/kb/bootstrap";
import { searchKnowledgeBase } from "@/lib/rag/search";
import { authorize, enforceRateLimit, errorResponse } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ q: z.string().trim().min(2).max(80) });

export async function GET(req: Request): Promise<NextResponse> {
  try {
    authorize(req);
    enforceRateLimit(req, "search");
    const parsed = Query.safeParse({ q: new URL(req.url).searchParams.get("q") ?? "" });
    if (!parsed.success) throw new AppError("invalid_request");
    await ensureReady().catch(() => {
      throw new AppError("database_unavailable");
    });
    const groups = await searchKnowledgeBase(await getDb(), parsed.data.q);
    return NextResponse.json({ query: parsed.data.q, groups }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
