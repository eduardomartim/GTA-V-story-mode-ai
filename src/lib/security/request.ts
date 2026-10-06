import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { AppError, SAFE_MESSAGES, type ErrorCode } from "@/lib/errors";
import { log } from "@/lib/log";
import { clientKey, rateLimit } from "./ratelimit";

export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Access control for the JSON APIs:
 * - same-origin browser calls (Sec-Fetch-Site: same-origin) are allowed without a key,
 * - everything else must present API_ACCESS_KEY (when configured). If no key is configured the API is an open demo,
 *   still protected by rate limiting, size limits and validation. Cross-site browser requests are always rejected.
 */
export function authorize(req: Request): void {
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new AppError("unauthorized");
  if (!env.API_ACCESS_KEY) return;
  if (site === "same-origin") return;
  const provided = Buffer.from(req.headers.get("x-api-key") ?? "");
  const expected = Buffer.from(env.API_ACCESS_KEY);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new AppError("unauthorized");
}

export function enforceRateLimit(req: Request, scope: string): void {
  const r = rateLimit(`${scope}:${clientKey(req.headers)}`, env.RATE_LIMIT_PER_MINUTE);
  if (!r.ok) throw new AppError("rate_limited", undefined, r.retryAfterSec);
}

/** Reads a JSON body with a hard byte cap (also enforced on the stream, not just Content-Length). */
export async function readJson(req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) throw new AppError("payload_too_large");
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) throw new AppError("payload_too_large");
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("invalid_request");
  }
}

export function errorResponse(err: unknown, lang: "pt" | "en" = "pt", requestId?: string): NextResponse {
  const app = err instanceof AppError ? err : new AppError("internal");
  if (!(err instanceof AppError)) log("error", "unhandled", { requestId, error: err instanceof Error ? err.message : "unknown" });
  const code: ErrorCode = app.code;
  return NextResponse.json(
    { error: { code, message: SAFE_MESSAGES[code][lang], requestId } },
    { status: app.status, headers: app.retryAfterSec ? { "retry-after": String(app.retryAfterSec) } : undefined },
  );
}
