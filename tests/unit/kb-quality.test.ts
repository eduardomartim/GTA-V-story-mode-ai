import { describe, expect, it } from "vitest";
import { loadKnowledgeBase } from "@/lib/kb/load";
import { validateKnowledgeBase } from "@/lib/kb/quality";
import { EntityRecord, type KnowledgeBase } from "@/lib/kb/schema";

const real = loadKnowledgeBase();
const errorsOf = (kb: KnowledgeBase) => validateKnowledgeBase(kb).filter((i) => i.level === "error").map((i) => i.message);

function entity(over: Record<string, unknown> = {}) {
  return EntityRecord.parse({
    id: "mission:test", type: "mission", name: "Test Mission", summary: "A test mission in Story Mode.",
    sources: [{ source: "gta-wiki", url: "https://gta.fandom.com/wiki/Test" }], ...over,
  });
}
const withEntities = (...entities: ReturnType<typeof entity>[]): KnowledgeBase => ({ ...real, entities, assets: [], backlog: [], completion: [] });

describe("shipped knowledge base", () => {
  it("passes every data-quality rule", () => expect(errorsOf(real)).toEqual([]));
  it("has unique entity ids, sources for every entity and is Story-Mode tagged", () => {
    const ids = real.entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(real.entities.every((e) => e.sources.length > 0)).toBe(true);
    expect(real.entities.filter((e) => e.type === "mission").every((e) => e.story_mode && !e.online_only)).toBe(true);
  });
  it("covers all 79 story missions listed by the reference wiki (Strangers and Freaks / side missions are separate)", () => {
    expect(real.entities.filter((e) => e.type === "mission" && !["stranger", "side"].includes(String(e.attrs.mission_type)))).toHaveLength(79);
  });
  it("keeps Online-only content isolated in online_boundary entities", () => {
    const online = real.entities.filter((e) => e.online_only);
    expect(online.length).toBeGreaterThan(5);
    expect(online.every((e) => e.type === "online_boundary" && !e.story_mode)).toBe(true);
  });
  it("never claims verified coordinates for curated locations", () => {
    expect(real.entities.filter((e) => e.type === "location").every((e) => e.location?.coord_precision !== "verified")).toBe(true);
  });
  it("records what it refuses to invent in the backlog", () => expect(real.backlog.length).toBeGreaterThan(10));
});

describe("validator rules catch bad data", () => {
  it("duplicate entity ids", () => expect(errorsOf(withEntities(entity(), entity()))).toContain("Duplicate entity_id"));
  it("entity without a known source", () =>
    expect(errorsOf(withEntities(entity({ sources: [{ source: "nope", url: "https://nope.com/x" }] })))).toContain('Unknown source "nope"'));
  it("source URL on the wrong host", () =>
    expect(errorsOf(withEntities(entity({ sources: [{ source: "gta-wiki", url: "https://evil.example/x" }] }))).join()).toMatch(/does not belong/));
  it("non-https source URL", () =>
    expect(errorsOf(withEntities(entity({ sources: [{ source: "gta-wiki", url: "http://gta.fandom.com/wiki/x" }] }))).join()).toMatch(/not a valid https/));
  it("mission tagged as Online-only (Story/Online contamination)", () => {
    const bad = entity({ story_mode: false, online_only: true });
    expect(errorsOf(withEntities(bad)).join()).toMatch(/Missions must be Story Mode|Only online_boundary/);
  });
  it("entity that is both story_mode and online_only", () =>
    expect(errorsOf(withEntities(entity({ story_mode: true, online_only: true })))).toContain("Entity cannot be story_mode and online_only"));
  it("id prefix must match type", () => expect(errorsOf(withEntities(entity({ id: "vehicle:test" }))).join()).toMatch(/does not match type/));
  it("relations must point to existing entities", () =>
    expect(errorsOf(withEntities(entity({ relations: [{ predicate: "requires", to: "mission:ghost" }] }))).join()).toMatch(/unknown entity mission:ghost/));
  it("coordinates outside map bounds", () =>
    expect(errorsOf(withEntities(entity({ id: "location:x", type: "location", location: { game_x: 99999, game_y: 0 } }))).join()).toMatch(/outside map bounds/));
  it("Online-unavailable vehicle cannot be tagged Story Mode", () =>
    expect(errorsOf(withEntities(entity({ id: "vehicle:x", type: "vehicle", attrs: { story_mode_available: false } }))).join()).toMatch(/cannot be tagged story_mode/));
});

describe("status and availability rules", () => {
  it("vehicles and weapons must declare availability", () => {
    expect(errorsOf(withEntities(entity({ id: "vehicle:x", type: "vehicle", attrs: {} }))).join()).toMatch(/needs attrs.availability/);
    expect(errorsOf(withEntities(entity({ id: "weapon:x", type: "weapon", attrs: { availability: "MAYBE" } }))).join()).toMatch(/needs attrs.availability/);
  });
  it("ONLINE_ONLY availability must match the online_only flag", () => {
    expect(errorsOf(withEntities(entity({ id: "vehicle:x", type: "vehicle", attrs: { availability: "ONLINE_ONLY" } }))).join()).toMatch(/must be online_only/);
    expect(errorsOf(withEntities(entity({ id: "online_boundary:x", type: "online_boundary", story_mode: false, online_only: true, attrs: { availability: "BOTH" } }))).join()).toBe("");
  });
  it("'verified' knowledge must be traceable to a retrieval date", () => {
    expect(errorsOf(withEntities(entity({ verification: "verified" }))).join()).toMatch(/requires a source with retrieved_at/);
    expect(errorsOf(withEntities(entity({ verification: "verified", sources: [{ source: "gta-wiki", url: "https://gta.fandom.com/wiki/Test", retrieved_at: "2026-10-06" }] }))).join()).toBe("");
  });
  it("a verified section needs a retrieved source too", () => {
    const e = entity({ sections: [{ kind: "x", title: "t", text: "long enough text", status: "verified" }] });
    expect(errorsOf(withEntities(e)).join()).toMatch(/requires a source with retrieved_at/);
  });
  it("the shipped KB uses all three statuses and every verified claim has a retrieval date", () => {
    const statuses = new Set(real.entities.flatMap((e) => [e.verification, ...e.sections.map((s) => s.status ?? e.verification)]));
    expect([...statuses].sort()).toEqual(["curated", "unverified", "verified"]);
  });
});

describe("every source link in the knowledge base is renderable", () => {
  it("passes the external-URL allow-list (so no source card silently loses its link)", async () => {
    const { isSafeExternalUrl } = await import("@/lib/security/url");
    const bad = real.entities.flatMap((e) => e.sources.map((s) => s.url)).filter((u) => !isSafeExternalUrl(u));
    expect([...new Set(bad)]).toEqual([]);
  });
});
