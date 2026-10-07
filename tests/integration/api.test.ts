import { beforeEach, describe, expect, it } from "vitest";
import { GET as health } from "@/app/api/health/route";
import { POST as chat } from "@/app/api/chat/route";
import { GET as search } from "@/app/api/search/route";
import { env } from "@/lib/env";
import { resetRateLimit } from "@/lib/security/ratelimit";

const post = (body: unknown, headers: Record<string, string> = {}, raw?: string) =>
  chat(new Request("http://localhost/api/chat", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: raw ?? JSON.stringify(body) }));

beforeEach(() => resetRateLimit());

describe("POST /api/chat", () => {
  it("returns a grounded answer, cards, sources and follow-ups (demo mode, no AI key)", async () => {
    const res = await post({ message: "Como fazer The Big Score?" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe("demo");
    expect(json.requestId).toMatch(/[0-9a-f-]{36}/);
    expect(json.sources.length).toBeGreaterThan(0);
    expect(json.cards.length).toBeGreaterThan(0);
    expect(json.followUps.length).toBeGreaterThan(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("accepts conversation history for follow-ups", async () => {
    const res = await post({ message: "E qual é a melhor abordagem?", history: [{ role: "assistant", content: "…", entities: ["heist:big-score"] }] });
    expect((await res.json()).meta.entities).toContain("heist:big-score");
  });

  it.each([
    ["empty message", { message: "" }],
    ["missing message", {}],
    ["message too long", { message: "x".repeat(601) }],
    ["wrong types", { message: 42 }],
    ["too much history", { message: "oi", history: Array.from({ length: 9 }, () => ({ role: "user", content: "x" })) }],
    ["bad entity id in history", { message: "oi", history: [{ role: "assistant", content: "x", entities: ["x'; drop table entities;--"] }] }],
    ["unknown role", { message: "oi", history: [{ role: "system", content: "x" }] }],
  ])("rejects invalid input: %s", async (_name, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_request");
    expect(JSON.stringify(json)).not.toMatch(/stack|zod|at \w+\./i);
  });

  it("rejects malformed JSON and oversized bodies", async () => {
    expect((await post(null, {}, "{not json")).status).toBe(400);
    expect((await post(null, {}, JSON.stringify({ message: "a", pad: "x".repeat(20_000) }))).status).toBe(413);
  });

  it("rate limits with 429 + Retry-After and a safe message", async () => {
    const original = env.RATE_LIMIT_PER_MINUTE;
    env.RATE_LIMIT_PER_MINUTE = 2;
    try {
      const h = { "x-forwarded-for": "203.0.113.9" };
      expect((await post({ message: "Space Docker" }, h)).status).toBe(200);
      expect((await post({ message: "Space Docker" }, h)).status).toBe(200);
      const blocked = await post({ message: "Space Docker" }, h);
      expect(blocked.status).toBe(429);
      expect(blocked.headers.get("retry-after")).toBeTruthy();
      expect((await blocked.json()).error.code).toBe("rate_limited");
    } finally {
      env.RATE_LIMIT_PER_MINUTE = original;
    }
  });

  it("blocks cross-site requests and enforces the optional API key", async () => {
    expect((await post({ message: "oi" }, { "sec-fetch-site": "cross-site" })).status).toBe(401);
    env.API_ACCESS_KEY = "k-123";
    try {
      expect((await post({ message: "Space Docker" })).status).toBe(401);
      expect((await post({ message: "Space Docker" }, { "x-api-key": "k-123" })).status).toBe(200);
    } finally {
      delete env.API_ACCESS_KEY;
    }
  });

  it("never echoes secrets or internals in responses", async () => {
    const text = await (await post({ message: "Space Docker" })).text();
    expect(text).not.toMatch(/SERVICE_ROLE|API_KEY|DATABASE_URL|process\.env/);
  });
});

describe("GET /api/search", () => {
  const get = (q: string) => search(new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`));
  it("returns grouped Story Mode results", async () => {
    const json = await (await get("jewel store")).json();
    const groups = json.groups.map((g: { group: string }) => g.group);
    expect(groups).toEqual(expect.arrayContaining(["Missions", "Locations"]));
  });
  it("never returns Online-only entities", async () => {
    const json = await (await get("cayo")).json();
    expect(JSON.stringify(json)).not.toMatch(/online_boundary/);
  });
  it("validates the query", async () => {
    expect((await get("a")).status).toBe(400);
    expect((await get("x".repeat(200))).status).toBe(400);
  });
  it("is injection-safe", async () => {
    const res = await get("'; drop table entities; --");
    expect(res.status).toBe(200);
    expect((await health().then((r) => r.json())).database.entities).toBeGreaterThan(0);
  });
});

describe("GET /api/health", () => {
  it("reports status without leaking secrets", async () => {
    const res = await health();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.ai).toEqual({ configured: false, mode: "demo" });
    expect(json.database.chunks).toBeGreaterThan(100);
    expect(JSON.stringify(json)).not.toMatch(/key|secret|postgres:\/\//i);
  });
});

describe("GET /api/map", () => {
  it("returns markers with a declared precision and no Online-only content", async () => {
    const { GET: map } = await import("@/app/api/map/route");
    const res = await map(new Request("http://localhost/api/map"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { markers: Array<{ id: string; precision: string; layer: string }> };
    expect(json.markers.length).toBeGreaterThan(100);
    expect(new Set(json.markers.map((m) => m.precision))).toEqual(new Set(["community", "approximate", "area"].filter((p) => json.markers.some((m) => m.precision === p))));
    expect(json.markers.some((m) => m.id.startsWith("online_boundary:"))).toBe(false);
  });

  it("serves the GPL coastline at runtime together with the dataset licence notices", async () => {
    const { GET: map } = await import("@/app/api/map/route");
    const json = (await (await map(new Request("http://localhost/api/map"))).json()) as {
      coastline: Array<Array<[number, number]>> | null; attribution: Array<{ dataset: string; licence: string; licenceUrl: string }>;
    };
    expect(json.coastline?.length).toBeGreaterThan(0);
    expect(json.attribution.map((a) => `${a.dataset}:${a.licence}`)).toEqual(["grandtheftwiki:CC BY-SA 3.0", "esx-collectables:GPL-3.0"]);
    expect(json.attribution.every((a) => a.licenceUrl.startsWith("https://"))).toBe(true);
  });

  it("rejects cross-site browser requests", async () => {
    const { GET: map } = await import("@/app/api/map/route");
    const res = await map(new Request("http://localhost/api/map", { headers: { "sec-fetch-site": "cross-site" } }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/chat language choice", () => {
  it("accepts an explicit answer language and rejects unknown ones", async () => {
    const ok = await post({ message: "Where is the Del Perro Pier?", lang: "pt" });
    expect((await ok.json()).lang).toBe("pt");
    expect((await post({ message: "oi", lang: "fr" })).status).toBe(400);
  });
});
