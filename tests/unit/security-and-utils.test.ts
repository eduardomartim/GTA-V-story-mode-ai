import { beforeEach, describe, expect, it } from "vitest";
import { hashEmbed, EMBEDDING_DIM } from "@/lib/ai/embeddings";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { redact } from "@/lib/log";
import { MAP_BOUNDS, gameToMap } from "@/lib/map/projection";
import { mapSvgMarkup } from "@/lib/map/svg";
import { resolveCitations } from "@/lib/rag/citations";
import { assembleContext } from "@/lib/rag/prompt";
import type { Candidate } from "@/lib/rag/types";
import { rateLimit, resetRateLimit } from "@/lib/security/ratelimit";
import { authorize, readJson } from "@/lib/security/request";
import { isSafeExternalUrl, safeUrl } from "@/lib/security/url";

describe("external URL allow-list (SSRF / unsafe link guard)", () => {
  it.each([
    "https://gta.fandom.com/wiki/Michael_De_Santa",
    "https://www.grandtheftwiki.com/Space_Docker",
    "https://support.rockstargames.com/gta-v",
    "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More",
  ])("accepts %s", (u) => expect(isSafeExternalUrl(u)).toBe(true));
  it.each([
    "http://gta.fandom.com/wiki/x", // not https
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "https://evil.com/gta.fandom.com",
    "https://gta.fandom.com.evil.com/x",
    "https://user:pass@gta.fandom.com/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "not a url",
    "",
  ])("rejects %s", (u) => expect(isSafeExternalUrl(u)).toBe(false));
  it("safeUrl returns undefined for unsafe values", () => {
    expect(safeUrl("https://evil.com")).toBeUndefined();
    expect(safeUrl(undefined)).toBeUndefined();
  });
});

describe("rate limiter", () => {
  beforeEach(() => resetRateLimit());
  it("allows up to the limit then blocks with Retry-After", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 60_000, 1000).ok).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, 2000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
  it("slides the window", () => {
    rateLimit("k", 1, 1000, 0);
    expect(rateLimit("k", 1, 1000, 500).ok).toBe(false);
    expect(rateLimit("k", 1, 1000, 1500).ok).toBe(true);
  });
  it("isolates clients", () => {
    rateLimit("a", 1, 1000, 0);
    expect(rateLimit("b", 1, 1000, 0).ok).toBe(true);
  });
});

describe("request guards", () => {
  it("rejects cross-site browser requests", () => {
    const req = new Request("http://x/api/chat", { method: "POST", headers: { "sec-fetch-site": "cross-site" } });
    expect(() => authorize(req)).toThrow(AppError);
  });
  it("requires the API key for non same-origin callers when configured", () => {
    env.API_ACCESS_KEY = "s3cret-key";
    try {
      expect(() => authorize(new Request("http://x"))).toThrow(AppError);
      expect(() => authorize(new Request("http://x", { headers: { "x-api-key": "wrong" } }))).toThrow(AppError);
      expect(() => authorize(new Request("http://x", { headers: { "x-api-key": "s3cret-key" } }))).not.toThrow();
      expect(() => authorize(new Request("http://x", { headers: { "sec-fetch-site": "same-origin" } }))).not.toThrow();
    } finally {
      delete env.API_ACCESS_KEY;
    }
  });
  it("enforces the body size limit and JSON validity", async () => {
    const big = new Request("http://x", { method: "POST", body: JSON.stringify({ a: "x".repeat(20_000) }) });
    await expect(readJson(big)).rejects.toMatchObject({ code: "payload_too_large" });
    await expect(readJson(new Request("http://x", { method: "POST", body: "{nope" }))).rejects.toMatchObject({ code: "invalid_request" });
    await expect(readJson(new Request("http://x", { method: "POST", body: '{"ok":1}' }))).resolves.toEqual({ ok: 1 });
  });
});

describe("log redaction", () => {
  it("redacts API-key-like tokens", () => {
    expect(redact("key sk-abcdefghijklmnop12345 and AIzaSyA1234567890abcdefghijk")).not.toMatch(/sk-abc|AIza/);
  });
});

describe("local embeddings", () => {
  it("produces normalised 384-d deterministic vectors", () => {
    const v = hashEmbed("jewel store job");
    expect(v).toHaveLength(EMBEDDING_DIM);
    expect(Math.hypot(...v)).toBeCloseTo(1, 5);
    expect(hashEmbed("jewel store job")).toEqual(v);
  });
  it("places related text closer than unrelated text", () => {
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
    const q = hashEmbed("how do I get the space docker");
    expect(dot(q, hashEmbed("space docker obtained by collecting spaceship parts"))).toBeGreaterThan(dot(q, hashEmbed("cheat code for invincibility painkiller")));
  });
});

describe("map projection and SVG", () => {
  it("projects game coordinates into 0..1 and clamps", () => {
    const p = gameToMap(MAP_BOUNDS.minX, MAP_BOUNDS.maxY);
    expect(p).toEqual({ x: 0, y: 0 });
    const q = gameToMap(99999, -99999);
    expect(q).toEqual({ x: 1, y: 1 });
  });
  it("north is up: larger y → smaller map_y", () => {
    expect(gameToMap(0, 5000).y).toBeLessThan(gameToMap(0, -2000).y);
  });
  it("escapes marker names (no markup injection)", () => {
    const svg = mapSvgMarkup([{ name: '<script>alert(1)</script>"', mapX: 0.5, mapY: 0.5 }]);
    expect(svg).not.toContain("<script>alert");
    expect(svg).toContain("&lt;script&gt;");
  });
});

const cand = (over: Partial<Candidate>): Candidate => ({
  chunkId: 1, entityId: "mission:a", entityType: "mission", entityName: "A", contentType: "overview", content: "text", sourceId: "gta-wiki",
  sourceName: "GTA Wiki", sourceType: "wiki", sourceUrl: "https://gta.fandom.com/wiki/A", authority: 7, confidence: 0.8, verification: "curated",
  spoilerLevel: 0, versions: [], semantic: 0.5, keyword: 0.5, entityScore: 0, via: ["vector"], score: 0.5, ...over,
});

describe("citation resolution", () => {
  const ctx = [cand({ entityName: "One" }), cand({ chunkId: 2, entityName: "Two", sourceUrl: "https://www.grandtheftwiki.com/B", sourceName: "Grand Theft Wiki" })];
  it("maps [S#] to numbered source links and drops invented labels", () => {
    const r = resolveCitations("Fato A [S2]. Fato B [S1][S9]. Fato C [S1, S2].", ctx);
    expect(r.cited).toBe(true);
    expect(r.text).not.toContain("S9");
    expect(r.text).toContain("[1](#source-1)");
    expect(r.sources.map((s) => s.sourceName)).toEqual(["Grand Theft Wiki", "GTA Wiki"]);
  });
  it("merges chunks that share a source URL", () => {
    const same = [cand({}), cand({ chunkId: 2, contentType: "strategy" })];
    expect(resolveCitations("A [S1] B [S2]", same).sources).toHaveLength(1);
  });
  it("attaches top sources even if the model cited nothing", () => {
    const r = resolveCitations("Sem citações.", ctx);
    expect(r.cited).toBe(false);
    expect(r.sources.length).toBeGreaterThan(0);
  });
});

describe("context assembly", () => {
  it("caps chunks per entity, honours k and drops weak matches", () => {
    // Distinct texts: identical chunks would (correctly) be removed as near-duplicates before the cap applies.
    const many = Array.from({ length: 10 }, (_, i) => cand({ chunkId: i, score: 1 - i * 0.01, content: `section ${i}: ${["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"][i]} details ${i * 7}` }));
    const other = cand({ chunkId: 99, entityId: "mission:b", score: 0.9 });
    const weak = cand({ chunkId: 100, entityId: "mission:c", score: 0.1 });
    const out = assembleContext([...many, other, weak], { k: 8, perEntity: 3 });
    expect(out.filter((c) => c.entityId === "mission:a")).toHaveLength(3);
    expect(out.some((c) => c.chunkId === 100)).toBe(false);
    expect(out.length).toBeLessThanOrEqual(8);
  });
});

describe("citation trust level", () => {
  it("a merged source card takes the least-trusted status of the blocks it backs", () => {
    const a = cand({ verification: "verified" });
    const b = cand({ chunkId: 2, verification: "unverified" });
    const r = resolveCitations("A [S1] B [S2]", [a, b]);
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0]?.verification).toBe("unverified");
  });
});

describe("context assembly — near-duplicate removal", () => {
  it("keeps one of two chunks of the same entity that say the same thing", async () => {
    const { assembleContext } = await import("@/lib/rag/prompt");
    const base = { entityId: "mission:a", entityType: "mission" as const, entityName: "A", contentType: "location", sourceId: "s", sourceName: "S", sourceType: "wiki", sourceUrl: "https://example.org", authority: 5, confidence: 0.8, verification: "curated", spoilerLevel: 0, versions: [], semantic: 0, keyword: 0, entityScore: 1, via: ["entity" as const] };
    const a = { ...base, chunkId: 1, score: 0.9, content: "A — Where it starts: A takes place at the Darnell Bros garment factory in La Mesa." };
    const b = { ...base, chunkId: 2, score: 0.8, content: "A — Location: A takes place at the Darnell Bros garment factory in La Mesa." };
    expect(assembleContext([a, b], { k: 5, perEntity: 5 })).toHaveLength(1);
  });
});
