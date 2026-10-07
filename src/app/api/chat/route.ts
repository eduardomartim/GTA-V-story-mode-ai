import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { ensureReady } from "@/lib/kb/bootstrap";
import { log } from "@/lib/log";
import { detectLang } from "@/lib/rag/lang";
import { runChat } from "@/lib/rag/pipeline";
import { authorize, enforceRateLimit, errorResponse, readJson } from "@/lib/security/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EntityId = z.string().regex(/^[a-z_]+:[a-z0-9-]+$/).max(80);
const ChatBody = z.object({
  message: z.string().trim().min(1).max(600),
  allowSpoilers: z.boolean().optional(),
  lang: z.enum(["pt", "en"]).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
        entities: z.array(EntityId).max(5).optional(),
      }),
    )
    .max(8)
    .default([]),
});

export async function POST(req: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  let lang: "pt" | "en" = "pt";
  try {
    authorize(req);
    enforceRateLimit(req, "chat");
    const parsed = ChatBody.safeParse(await readJson(req));
    if (!parsed.success) throw new AppError("invalid_request");
    lang = parsed.data.lang ?? detectLang(parsed.data.message);
    await ensureReady().catch((err) => {
      log("error", "bootstrap_failed", { requestId, error: (err as Error).message });
      throw new AppError("database_unavailable");
    });
    const result = await runChat({ message: parsed.data.message, history: parsed.data.history, allowSpoilers: parsed.data.allowSpoilers, lang: parsed.data.lang, requestId });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err, lang, requestId);
  }
}
