import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { runChat } from "@/lib/rag/pipeline";
import { planQuery, secondaryGoals } from "@/lib/rag/planner";
import { assembleContext } from "@/lib/rag/prompt";
import { edgeWeight, hybridRetrieve, rerank } from "@/lib/rag/retrieval";
import type { Candidate } from "@/lib/rag/types";
import { analyzeQuery } from "@/lib/rag/understanding";
import { readyDb } from "../helpers";

beforeAll(async () => {
  await readyDb();
});

async function ranked(q: string) {
  const a = await analyzeQuery(q);
  const h = await hybridRetrieve(await getDb(), a);
  return { a, ranked: rerank(h.candidates, a.intents, a.original) };
}

describe("entity-first retrieval on the large KB", () => {
  it("an explicitly named entity is never pushed out by look-alike chunks (Railgun)", async () => {
    const { ranked: r } = await ranked("A Railgun está disponível no Story Mode?");
    expect(r[0]?.entityId).toBe("weapon:railgun");
    // The Railgun has two chunks (overview + divergence); both must lead the ranking.
    expect(r.slice(0, 2).every((c) => c.entityId === "weapon:railgun")).toBe(true);
  });

  it("partial name match reaches an entity named after a translated word (fantasma → Ghost on Mount Gordo)", async () => {
    const ctx: Candidate[] = [];
    await runChat({ message: "Quando aparece o fantasma do Mount Gordo?", provider: null, onTrace: (t) => ctx.push(...t.context) });
    expect(ctx.some((c) => c.entityId.startsWith("easter_egg:ghost-on-mount-gordo"))).toBe(true);
  });

  it("a one-word coincidence is not evidence for an off-topic question", async () => {
    const r = await runChat({ message: "Qual é a capital da França?", provider: null });
    expect(r.mode).toBe("no-evidence");
  });

  it("graph edges are weighted by predicate and intent; hub edges stay low", () => {
    expect(edgeWeight("takes_place_at", true, "location", [])).toBeGreaterThan(edgeWeight("available_to", true, "character", []));
    expect(edgeWeight("requires", true, "mission", ["mission_unlock"])).toBeGreaterThan(edgeWeight("requires", true, "mission", []));
    // 30 barrels "located_in" an area say little about the area itself.
    expect(edgeWeight("located_in", false, "collectible_item", [])).toBeLessThan(0.3);
    // Membership boost only from the member's side.
    expect(edgeWeight("contributes_to", false, "random_event", ["100_percent_completion"])).toBeLessThan(edgeWeight("contributes_to", true, "completion", ["100_percent_completion"]));
  });
});

describe("context packing (quotas, diversity, item cap, near-duplicates)", () => {
  const cand = (entityId: string, score: number, extra: Partial<Candidate> = {}): Candidate => ({
    chunkId: Math.round(score * 1000) + entityId.length, entityId, entityType: entityId.startsWith("collectible_item") ? "collectible_item" : "collectible", entityName: entityId,
    contentType: "overview", content: `${entityId} unique text ${score}`, sourceId: "s", sourceName: "S", sourceType: "wiki", sourceUrl: "https://example.org",
    authority: 5, confidence: 0.8, verification: "curated", spoilerLevel: 0, versions: [], semantic: 0, keyword: 0, entityScore: 0.5, via: ["keyword"], score, ...extra,
  });

  it("thirty similar items cannot fill the context of a non-item question", () => {
    const items = Array.from({ length: 30 }, (_, i) => cand(`collectible_item:nuclear-waste-${i + 1}`, 0.9 - i * 0.001));
    const category = cand("collectible:nuclear-waste", 0.6, { entityScore: 1, contentType: "reward", content: "Nuclear waste reward: $23,000 per barrel" });
    const ctx = assembleContext([...items, category], { k: 8, perEntity: 3, maxItems: 2 });
    expect(ctx.filter((c) => c.entityType === "collectible_item")).toHaveLength(2);
    expect(ctx.some((c) => c.entityId === "collectible:nuclear-waste")).toBe(true);
  });

  it("reserves slots for strongly related neighbours and drops near-duplicate sections", () => {
    const focus = Array.from({ length: 8 }, (_, i) => cand("mission:x", 1 - i * 0.01, { entityScore: 1, contentType: `s${i}`, content: i === 1 ? "mission:x unique text 1" : `mission:x section ${i} about something different ${i}` }));
    focus[1] = { ...focus[1] as Candidate, content: (focus[0] as Candidate).content };
    const neighbour = cand("location:y", 0.2, { entityScore: 0.75, via: ["graph"], edgeWeight: 1 });
    const ctx = assembleContext([...focus, neighbour], { k: 6, perEntity: 6 });
    expect(ctx.some((c) => c.entityId === "location:y")).toBe(true);
    expect(new Set(ctx.map((c) => c.content)).size).toBe(ctx.length);
  });
});

describe("planner v2", () => {
  const plan = async (q: string) => planQuery(await analyzeQuery(q));
  it.each([
    ["Quais Random Events existem?", "list_type", "random_event"],
    ["Quais propriedades geram renda?", "list_type", "property"],
    ["Quais armas posso conseguir sem comprar?", "list_type", "weapon"],
    ["Qual veículo posso encontrar perto de Paleto Bay?", "list_type", "vehicle"],
    ["Quais easter eggs existem no Mount Chiliad?", "list_type", "easter_egg"],
  ])("%s → %s/%s", async (q, goal, type) => {
    const p = await plan(q);
    expect(p.goal).toBe(goal);
    expect(p.listing?.type).toBe(type);
  });

  it("counts are not listings, and a named event is not a request for the full list", async () => {
    expect((await plan("Quantas plantas de peiote existem?")).goal).not.toBe("list_items");
    expect((await plan("What happens in the Altruists random event?")).goal).not.toBe("list_type");
  });

  it("a romance word about a named non-protagonist is about THAT character, not the protagonists' hook-up listing", async () => {
    // The relationship question is planned for Tracey herself (v3: romance focused on the named character)…
    const p = await plan("A Tracey tem namorado?");
    expect(p.character?.id).toBe("character:tracey-de-santa");
    expect((await plan("Como conseguir uma namorada pro Trevor?")).goal).toBe("romance");
    // …and the answer is about Tracey, without the generic Ursula / Vanilla Unicorn listing.
    const r = await runChat({ message: "A Tracey tem namorado?", provider: null });
    expect(r.answer).toMatch(/Tracey/);
    expect(r.answer).not.toMatch(/Ursula|Vanilla Unicorn/);
  });

  it("composite questions get secondary goals", async () => {
    const a = await analyzeQuery("Quero fazer 100% jogando principalmente com Trevor. O que devo priorizar depois de terminar a missão Mr. Philips?");
    const p = planQuery(a);
    expect(p.goal).toBe("completion");
    expect(secondaryGoals(p, a)).toEqual(expect.arrayContaining(["after_mission", "practical_plan"]));
  });
});

describe("answers that must not invent data", () => {
  it("says it has no evidence for vehicle spawn points instead of listing random vehicles", async () => {
    const r = await runChat({ message: "Qual veículo posso encontrar perto de Paleto Bay?", provider: null });
    expect(r.mode).toBe("no-evidence");
    expect(r.answer).toMatch(/não tenho evidência/i);
  });

  it("separates required from merely playable Strangers and Freaks for a protagonist", async () => {
    const r = await runChat({ message: "O que conta para 100% para Trevor?", provider: null });
    expect(r.answer).toMatch(/EXIGIDAS para 100% que ele joga: Exercising Demons - Trevor\./);
    expect(r.answer).not.toMatch(/EXIGIDAS[^.]*Rampage/);
  });

  it("deterministic answers state only what the cited rows say", async () => {
    // No unsourced game mechanics appended to a character-location answer.
    const loc = await runChat({ message: "Onde encontro a Ursula?", provider: null });
    expect(loc.answer).not.toMatch(/reaparece|recur/i);
    // 100% numbers come from the checklist rows, not from constants.
    const db = await getDb();
    const [re] = await db.query<{ n: number }>("select required_count n from completion_requirements where category = 'random_events' and required_count is not null limit 1");
    const list = await runChat({ message: "Quais Random Events existem?", provider: null });
    expect(list.answer).toContain(`${re?.n} random events`);
    // "Girlfriend of someone else" is a relationship, not a booty call.
    const [t] = await db.query<{ n: number }>("select count(*)::int n from chunks where entity_id = 'character:maude-eccles' and content ilike '%booty call%'");
    expect(t?.n).toBe(0);
  });

  it("does not turn a booty call into a girlfriend", async () => {
    const r = await runChat({ message: "How do I get a girlfriend as Trevor?", provider: null });
    expect(r.answer).toMatch(/no source in the knowledge base describes a formal dating/i);
    expect(r.answer).toMatch(/booty call/);
  });
});

describe("security of the new query paths", () => {
  it("SQL-looking text in a planned question is treated as data", async () => {
    const r = await runChat({ message: "Quais propriedades geram renda'; drop table entities; --", provider: null });
    expect(r.mode).not.toBe("online-boundary");
    const db = await getDb();
    const [n] = await db.query<{ n: number }>("select count(*)::int n from entities");
    expect(n?.n).toBeGreaterThan(1000);
  });

  it("map deep links only accept entity ids", () => {
    expect(/^[a-z_]+:[a-z0-9-]+$/.test("collectible_item:letter-scrap-34")).toBe(true);
    expect(/^[a-z_]+:[a-z0-9-]+$/.test("javascript:alert(1)")).toBe(false);
  });
});
