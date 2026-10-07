import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { getMarkers } from "@/lib/map/markers";
import { runChat } from "@/lib/rag/pipeline";
import { planQuery } from "@/lib/rag/planner";
import { analyzeQuery } from "@/lib/rag/understanding";
import type { CardData } from "@/lib/rag/types";
import { fakeProvider, readyDb } from "../helpers";

beforeAll(async () => {
  await readyDb();
});

const plan = async (q: string) => planQuery(await analyzeQuery(q));
const card = <K extends CardData["kind"]>(cards: CardData[], kind: K) => cards.find((c): c is Extract<CardData, { kind: K }> => c.kind === kind);

describe("query planner (decomposition into goal + constraints)", () => {
  it.each([
    ["Mostre as 5 peças de nave mais próximas de Sandy Shores", "nearest"],
    ["Quais letter scraps ficam em Paleto Bay?", "in_area"],
    ["Quais são todas as peças de nave?", "list_items"],
    ["Onde fica a peça de nave 37?", "item_lookup"],
    ["Como conseguir uma namorada pro Trevor?", "romance"],
    ["Quais atividades do Trevor contam para 100%?", "completion"],
    ["Quais colecionáveis estão perto de Sandy Shores?", "nearby_collectibles"],
    ["Onde encontro peyote perto do Trevor?", "nearest"],
    ["Quem é Franklin?", null],
  ])("%s → %s", async (q, goal) => {
    expect((await plan(q)).goal).toBe(goal);
  });

  it("extracts the constraints it plans with", async () => {
    const p = await plan("Mostre as 3 peças de nave mais próximas de Sandy Shores");
    expect(p).toMatchObject({ limit: 3, category: { id: "collectible:spaceship-parts" }, area: { id: "location:sandy-shores" } });
    expect((await plan("Onde encontro peyote perto do Trevor?")).protagonist).toBe("Trevor");
  });
});

describe("structured executors (SQL + graph + geo) answer without the LLM", () => {
  it("nearest: ranks items by real distance and cites the coordinate source", async () => {
    const p = fakeProvider();
    const r = await runChat({ message: "Mostre as 5 peças de nave mais próximas de Sandy Shores", provider: p });
    expect(p.calls).toHaveLength(0);
    expect(r.mode).toBe("structured");
    expect(r.meta.plan?.goal).toBe("nearest");
    const items = card(r.cards, "items");
    expect(items?.rows).toHaveLength(5);
    const d = items?.rows.map((x) => x.distance ?? 0) ?? [];
    expect([...d].sort((a, b) => a - b)).toEqual(d);
    expect(r.sources[0]?.url).toMatch(/^https:\/\/github\.com\/Mobius1\/esx_collectables/);
    expect(card(r.cards, "map")?.markers.length).toBeGreaterThan(1);
  });

  it("in_area: lists only the items of that area, with the wiki as source", async () => {
    const r = await runChat({ message: "Quais letter scraps ficam em Paleto Bay?", provider: null });
    expect(r.mode).toBe("structured");
    expect(r.answer).toMatch(/Procopio Dr/);
    expect(r.answer).not.toMatch(/Vinewood Sign/);
    expect(r.sources.some((s) => s.url.includes("grandtheftwiki.com/Letter_Scraps"))).toBe(true);
  });

  it("item lookup: does not invent an item that does not exist", async () => {
    const r = await runChat({ message: "Onde fica a peça de nave 99?", provider: null });
    expect(r.answer).not.toMatch(/Spaceship Part #99/);
  });

  it("romance: answers from hookup_with edges with the source sentence as evidence", async () => {
    const r = await runChat({ message: "Como conseguir uma namorada pro Trevor?", provider: null });
    expect(r.meta.plan?.goal).toBe("romance");
    const rel = card(r.cards, "relationship");
    expect(rel?.name).toBe("Ursula");
    expect(rel?.protagonists).toEqual(expect.arrayContaining(["Trevor", "Franklin"]));
    expect(rel?.protagonists).not.toContain("Michael");
    expect(rel?.evidence).toMatch(/booty call/);
  });

  it("completion: separates required from total and filters by protagonist", async () => {
    const r = await runChat({ message: "Quais atividades do Trevor contam para 100%?", provider: null });
    const c = card(r.cards, "completion");
    expect(c?.protagonist).toBe("Trevor");
    const misc = c?.groups.find((g) => g.category === "miscellaneous")?.items ?? [];
    expect(misc.find((i) => /Stunt jumps/i.test(i.label))).toMatchObject({ required: 25, total: 50 });
    expect(c?.groups.some((g) => g.category === "not_required")).toBe(false);
  });

  it("answers in the language chosen in the UI even when the question is in another language", async () => {
    const r = await runChat({ message: "Show the 5 spaceship parts closest to Sandy Shores", lang: "pt", provider: null });
    expect(r.lang).toBe("pt");
    expect(r.answer).toMatch(/mais próximos de/);
  });
});

describe("map layer data", () => {
  it("every marker declares its precision; community coordinates come from the dataset", async () => {
    const markers = await getMarkers(await getDb());
    expect(markers.length).toBeGreaterThan(200);
    expect(markers.every((m) => ["verified", "community", "approximate", "area"].includes(m.precision))).toBe(true);
    const part = markers.find((m) => m.id === "collectible_item:spaceship-part-37");
    expect(part).toMatchObject({ layer: "spaceship-parts", precision: "community" });
    expect(markers.every((m) => m.x >= 0 && m.x <= 1 && m.y >= 0 && m.y <= 1)).toBe(true);
    expect(markers.some((m) => m.layer === "online_boundary")).toBe(false);
  });
});
