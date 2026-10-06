/**
 * Sliding-window in-memory rate limiter (per client key). Suitable for a single instance / demo.
 * For multi-instance production, swap the Map for Redis/Upstash behind the same function signature.
 */
const g = globalThis as unknown as { __gtaRl?: Map<string, number[]> };
const hits = (g.__gtaRl ??= new Map<string, number[]>());

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()): RateLimitResult {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    hits.set(key, recent);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
  return { ok: true, remaining: limit - recent.length, retryAfterSec: 0 };
}

export function clientKey(headers: Headers): string {
  // Behind a trusted proxy x-forwarded-for is set by the platform; take only the first hop.
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip") || "local";
}

export function resetRateLimit(): void {
  hits.clear();
}
