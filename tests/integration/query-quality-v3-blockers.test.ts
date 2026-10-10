import { beforeAll, describe, expect, it } from "vitest";
import { canonicalizeQuery, expandQuery } from "@/lib/rag/glossary";
import { runChat } from "@/lib/rag/pipeline";
import { planClauses, planQuery } from "@/lib/rag/planner";
import { analyzeQuery } from "@/lib/rag/understanding";
import { readyDb } from "../helpers";

beforeAll(async () => {
  await readyDb();
});

const ask = (message: string) => runChat({ message, provider: null });
const plan = async (q: string) => planQuery(await analyzeQuery(q));

describe("a vehicle class lists vehicles only when the question asks for vehicles", () => {
  it.each([
    "Quais cheats de super pulo existem?",
    "Quais missões envolvem a polícia?",
    "Quais bases militares existem no mapa?",
    "Which police missions are there?",
    "Quais esportes existem no jogo?",
  ])("%s is not a vehicle listing", async (q) => {
    const p = await plan(q);
    expect(p.listing?.type).not.toBe("vehicle");
    expect((await ask(q)).answer).not.toMatch(/Veículos da classe|Vehicles of class/);
  });

  it.each([
    ["Quais carros esportivos existem?", "sports"],
    ["Quais veículos militares existem?", "military"],
    ["Quais veículos policiais existem?", "emergency"],
    ["Which military vehicles are there?", "military"],
    ["Quais motos existem?", "motorcycles"],
    ["Quais helicópteros existem?", "helicopters"],
    ["Quais caminhões existem?", "commercial"],
    ["Quais supercarros existem?", "super"],
  ])("%s lists the %s class", async (q, cls) => {
    const p = await plan(q);
    expect(p.goal).toBe("list_type");
    expect(p.listing?.type).toBe("vehicle");
    expect(p.listing?.vehicleClass).toContain(cls);
  });

  it("a class listing answers with vehicles of that class", async () => {
    expect((await ask("Quais veículos militares existem?")).answer).toMatch(/classe military/);
  });
});

describe("attribute clauses are recognised whatever the accents and casing", () => {
  it("price (accented) + who can buy: a missing price is said, not replaced by the summary", async () => {
    const r = await ask("Qual o preço do Hookies e quem pode comprar?");
    expect(r.answer).toMatch(/\*\*Qual o preço do Hookies\?\*\*\s+A base não registra o preço — \*\*Hookies\*\*/);
    expect(r.answer).toMatch(/\*\*Quem pode comprar\?\*\*\s+buyable by: Michael, Franklin/);
  });

  it("capitalised clauses keep the user's wording in the heading and are still recognised", async () => {
    const r = await ask("QUAL O PREÇO DO HOOKIES E QUEM PODE COMPRAR?");
    expect(r.answer).toContain("**QUAL O PREÇO DO HOOKIES?**");
    expect(r.answer).toMatch(/A base não registra o preço/);
    expect(r.answer).toMatch(/buyable by: Michael, Franklin/);
  });

  it("'Quem pode …' first, then income: both attributes detected", async () => {
    const r = await ask("Quem pode comprar o Hookies e quanto ele rende?");
    expect(r.answer).toMatch(/\*\*Quem pode comprar o Hookies\?\*\*\s+buyable by: Michael, Franklin/);
    expect(r.answer).toMatch(/A base não registra a renda semanal — \*\*Hookies\*\*/);
  });

  it("accented time clause ('horário') is answered from the recorded time", async () => {
    const r = await ask("Onde fica o fantasma do Mount Gordo e qual é o horário?");
    expect(r.answer).toMatch(/23:00/);
    expect(r.answer).not.toMatch(/não registra o horário/);
  });

  it("English attribute clauses are unchanged", async () => {
    const r = await ask("What is the price of Hookies and who can buy it?");
    expect(r.answer).toMatch(/does not record the price — \*\*Hookies\*\*/);
    expect(r.answer).toMatch(/buyable by: Michael, Franklin/);
  });

  it("a clause without an attribute word still gets the entity summary (negative)", async () => {
    const plans = planClauses(await analyzeQuery("Onde fica o Hookies e quem pode comprar?"));
    expect(plans.length).toBeGreaterThanOrEqual(2);
    const r = await ask("Onde fica o Hookies e quem pode comprar?");
    expect(r.answer).not.toMatch(/não registra (o preço|a renda|o horário)/);
  });
});

describe("diminutives are undone only for lexicon words", () => {
  it.each(["caminho", "sozinho", "vizinho", "cozinha", "linha", "sozinha", "caminhos"])("'%s' is left as it is", (w) => {
    expect(canonicalizeQuery(`qual o ${w} do michael`)).toBe(`qual o ${w} do michael`);
  });

  it("lexicon diminutives still resolve, with and without accents", () => {
    expect(canonicalizeQuery("onde estão as cartinhas")).toBe("onde estao as letter scraps");
    expect(canonicalizeQuery("onde fica o fantasminha")).toBe("onde fica o ghost");
    expect(canonicalizeQuery("pecinhas da nave")).toBe("spaceship parts");
    expect(canonicalizeQuery("Onde está o OVNI?")).toBe("onde esta o ufo");
  });

  it("English text is unchanged and expansion adds no corrupted words", () => {
    expect(canonicalizeQuery("Where is the ghost on Mount Gordo?")).toBe("where is the ghost on mount gordo");
    expect(expandQuery("O Michael mora sozinho?")).not.toMatch(/\bsozo\b/);
    expect(expandQuery("Qual o caminho até a casa do Franklin?")).not.toMatch(/\bcamo\b/);
  });
});
