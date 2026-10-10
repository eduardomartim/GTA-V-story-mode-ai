import { beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { canonicalizeQuery } from "@/lib/rag/glossary";
import { runChat } from "@/lib/rag/pipeline";
import { planClauses, planQuery } from "@/lib/rag/planner";
import type { Candidate } from "@/lib/rag/types";
import { analyzeQuery } from "@/lib/rag/understanding";
import { readyDb } from "../helpers";

beforeAll(async () => {
  await readyDb();
});

const ask = (message: string) => runChat({ message, provider: null });
const db = () => getDb();

describe("100% completion: specific questions get specific answers", () => {
  it("a count question gets the count from the collectible record, not the checklist", async () => {
    const [row] = await (await db()).query<{ total: number }>("select total from collectibles where entity_id = 'collectible:stunt-jumps'");
    const r = await ask("Quantos Stunt Jumps existem?");
    expect(r.answer).toContain(`**${row?.total}**`);
    expect(r.answer).not.toMatch(/Checklist de 100%/);
  });

  it("'does X count for 100%' reads the checklist row for X (required vs optional)", async () => {
    const [opt] = await (await db()).query<{ label: string }>("select label from completion_requirements where category = 'not_required' and 'collectible:peyote-plants' = any(target_ids)");
    const r = await ask("Peyote conta para 100%?");
    expect(r.answer).toMatch(/Não é exigido para 100%/);
    expect(r.answer).toContain(opt?.label as string);
    // "peyote" is also a car: the answer is about the plants, once.
    expect(r.answer.match(/Não é exigido/g)).toHaveLength(1);
  });

  it("how many are required comes from the requirement row", async () => {
    const [req] = await (await db()).query<{ required_count: number }>("select required_count from completion_requirements where category = 'miscellaneous' and 'collectible:stunt-jumps' = any(target_ids)");
    expect((await ask("Quantos Stunt Jumps são necessários para 100%?")).answer).toMatch(new RegExp(`\\(${req?.required_count}/`));
  });

  it("a part of the checklist lists only that part", async () => {
    const hobbies = await ask("Quais hobbies contam para 100%?");
    expect(hobbies.answer).toMatch(/Hobbies/);
    expect(hobbies.answer).not.toMatch(/storyline missions/);
    const props = await ask("Quais propriedades são necessárias para 100%?");
    expect(props.answer).toMatch(/Purchase any five properties/);
    const coll = await ask("Quais coletáveis contam para 100%?");
    expect(coll.answer).toMatch(/Collect all Letter Scraps/);
    expect(coll.answer).not.toMatch(/Peter Dreyfuss|Epsilon Program/);
  });

  it("a broad question still gets the whole checklist, and 'what's missing' says progress is unknown", async () => {
    expect((await ask("O que preciso fazer para completar 100%?")).answer).toMatch(/Checklist de 100%/);
    expect((await ask("O que falta para 100%?")).answer).toMatch(/Não tenho acesso ao seu progresso/);
  });
});

describe("names the knowledge base does not have", () => {
  it("an unknown mission name is reported as not found in the KB, without unrelated evidence", async () => {
    const r = await ask("Como faço a missão Operação Tempestade do Deserto com o Trevor?");
    expect(r.answer).toMatch(/Não encontrei uma missão correspondente a \*\*“Operação Tempestade do Deserto”\*\*/);
    expect(r.answer).toMatch(/não quer dizer que não exista no jogo/);
    expect(r.sources).toHaveLength(0);
  });

  it("works in English and for easter eggs", async () => {
    expect((await ask("Who is the character Johnny Klebitz?")).answer).toMatch(/couldn't find a character matching/);
    expect((await ask("Onde fica o easter egg do dragão no Mount Josiah?")).answer).toMatch(/Não encontrei um easter egg correspondente a \*\*“dragão”\*\*/);
  });

  it("a near-miss name is corrected and the correction is shown", async () => {
    const r = await ask("Como faço a missão Paleto Scor?");
    expect(r.answer).toMatch(/Interpretei “Paleto Scor” como \*\*The Paleto Score\*\*/);
    expect((await ask("Onde fica o Vanila Unicorn?")).answer).toMatch(/Vanilla Unicorn/);
  });

  it("a name shared by several entities asks which one", async () => {
    const r = await ask("Como faço a missão Exercising Demons?");
    expect(r.mode).toBe("clarify");
    expect(r.answer).toMatch(/Exercising Demons - Franklin/);
    expect(r.answer).toMatch(/Exercising Demons - Trevor/);
  });

  it("ordinary words after a type noun are not taken for a name", async () => {
    for (const q of ["Quanto dinheiro cada personagem ganha no Big Score?", "Essa missão não apareceu. O que faço?", "Which mission uses the Duster?", "Quais são todas as missões do Lester?"]) {
      expect((await analyzeQuery(q)).unresolved, q).toEqual([]);
    }
  });

  it("off-topic questions still have no evidence", async () => {
    expect((await ask("Qual é a capital da França?")).mode).toBe("no-evidence");
    expect((await ask("Qual a receita de bolo de cenoura?")).mode).toBe("no-evidence");
  });
});

describe("geography: areas, regions and places sharing a name", () => {
  it("a region name covers every item recorded in that region", async () => {
    const [n] = await (await db()).query<{ n: number }>("select count(*)::int n from collectible_items where category_id = 'collectible:under-the-bridge' and region = 'Los Santos'");
    const r = await ask("Quais Under the Bridge existem em Los Santos?");
    expect(r.answer).toContain(`Under the Bridge em Los Santos (${n?.n})`);
  });

  it("a word naming several places means all of them, and only them", async () => {
    const r = await ask("Quais letter scraps estão em Vinewood?");
    const areas = [...r.answer.matchAll(/Letter Scrap #\d+ — ([^:]+):/g)].map((m) => m[1] as string);
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((a) => /vinewood/i.test(a))).toBe(true);
  });

  it("secrets in an area include the ones whose description names it", async () => {
    const r = await ask("Quais easter eggs existem em Sandy Shores?");
    expect(r.answer).toMatch(/Red Dead/);
  });
});

describe("listing constraints reach the executor", () => {
  it("vehicle class", async () => {
    const r = await ask("Quais carros esportivos existem no modo história?");
    const classes = [...r.answer.matchAll(/ \(([^)]+)\) \[/g)].map((m) => (m[1] as string).toLowerCase());
    expect(classes.length).toBeGreaterThan(5);
    expect(classes.every((c) => c === "sports")).toBe(true);
    expect((await ask("Which super cars are in story mode?")).answer).toMatch(/Zentorno \(Super\)/);
  });

  it("protagonist: random events and strangers", async () => {
    const r = await ask("Quais random events o Trevor pode fazer?");
    expect(r.answer).toMatch(/Random events que Trevor pode fazer/);
    expect(r.answer).not.toMatch(/Rogue Altruists/); // Franklin or Michael only
    const s = await ask("Quais Strangers and Freaks do Michael?");
    expect(s.answer).toMatch(/Strangers and Freaks — Michael/);
    expect(s.answer).not.toMatch(/Paparazzo/); // Franklin's
  });

  it("vehicles at a place: the documented ones there, and an honest gap where there are none", async () => {
    const r = await ask("Quais veículos posso encontrar em Fort Zancudo?");
    expect(r.answer).toMatch(/P-996 Lazer \(Fort Zancudo\)/);
    expect((await ask("Qual veículo posso encontrar perto de Paleto Bay?")).mode).toBe("no-evidence");
  });

  it("'the order of X's missions' is the ordered mission list", async () => {
    expect((await ask("Qual é a ordem das missões do Trevor?")).answer).toMatch(/in story order: 1\. Prologue; 16\. Mr\. Philips/);
  });
});

describe("compound questions answer every part", () => {
  it("three attribute clauses about one entity", async () => {
    const r = await ask("Quanto custa o Hookies, quem pode comprar e quanto ele rende?");
    expect(r.answer).toMatch(/Quanto custa o Hookies\?\*\*[\s\S]*A base não registra o preço/);
    expect(r.answer).toMatch(/Michael, Franklin/);
    expect(r.answer).toMatch(/A base não registra a renda semanal/);
  });

  it("where + who + 100% for one entity", async () => {
    const r = await ask("Me diga onde encontrar a Space Docker, quem pode usar e se isso é necessário para 100%.");
    expect(r.answer).toMatch(/Omega's garage/);
    expect(r.answer).toMatch(/Spaceship Parts — "Collect all Spaceship Parts/);
  });

  it("who + where, and count + 100% (said once)", async () => {
    const u = await ask("Quem é a Ursula e onde encontro ela?");
    expect(u.answer).toMatch(/random character/);
    expect(u.answer).toMatch(/Hitch Lift 2/);
    const s = await ask("Quantos Stunt Jumps existem e quantos contam para 100%?");
    expect(s.answer.match(/existem \*\*50\*\*/g)).toHaveLength(1);
    expect(s.answer).toMatch(/Complete 25 Stunt jumps/);
  });

  it("context before the question is not a clause of its own", async () => {
    expect(planClauses(await analyzeQuery("In the Big Score, does Subtle or Obvious pay more?"))).toEqual([]);
  });
});

describe("Portuguese and community wording", () => {
  it("canonical lexicon", () => {
    expect(canonicalizeQuery("onde acho as cartinhas?")).toBe("onde acho as letter scraps");
    expect(canonicalizeQuery("tem disco voador no jogo?")).toBe("tem ufo no jogo");
    expect(canonicalizeQuery("onde fica o lixo radioativo")).toBe("onde fica o nuclear waste");
    expect(canonicalizeQuery("Where are the hidden packages?")).toBe("where are the hidden packages");
  });

  it("community words resolve to entities and answers", async () => {
    expect((await analyzeQuery("onde acho as cartinhas?")).entities.map((e) => e.id)).toContain("collectible:letter-scraps");
    const ctx: Candidate[] = [];
    const ufo = await runChat({ message: "Onde encontro o OVNI no GTA V?", provider: null, onTrace: (t) => ctx.push(...t.context) });
    expect(ufo.mode).not.toBe("no-evidence");
    expect(ctx.some((c) => c.entityId === "easter_egg:sunken-ufo-north-east-of-paleto-bay")).toBe(true);
  });

  it("natural relationship wording plans the relationship answer", async () => {
    for (const q of ["Com quem o Trevor pode ficar?", "O Franklin namora alguém?", "Quais personagens têm interação romântica?"]) {
      expect((await planQuery(await analyzeQuery(q))).goal, q).toBe("romance");
    }
  });

  it("chat abbreviations are normalised before planning", async () => {
    expect(canonicalizeQuery("q missao libera o paleto score")).toBe("que missao libera o paleto score");
    expect((await planQuery(await analyzeQuery("q missao libera o paleto score"))).goal).toBe("unlocked_by");
  });

  it("a reward question about a category answers the reward, not the item list", async () => {
    const r = await ask("O que ganho coletando todas as peças de nave?");
    expect(r.answer).toMatch(/Space Docker/);
    expect(r.answer).not.toMatch(/Spaceship Part #1 /);
  });

  it("English entity resolution is unchanged", async () => {
    expect((await analyzeQuery("Where is the Vangelico jewelry store?")).entities.map((e) => e.id)).toContain("location:vangelico-jewelry-store");
  });
});

describe("grounding gate", () => {
  it("accepts an entity found by a strong name match (positive)", async () => {
    const r = await ask("Tem algum segredo no apartamento da Debra?");
    expect(r.mode).not.toBe("no-evidence");
    expect(r.answer).toMatch(/Debra/);
  });

  it("partially supported: says which attribute is missing", async () => {
    expect((await ask("Quanto rende o Hookies por semana?")).answer).toMatch(/A base não registra a renda semanal — \*\*Hookies\*\*/);
    expect((await ask("Which character can use the Musket?")).answer).toMatch(/does not record who can use — \*\*Musket\*\*/);
  });
});

describe("gap warnings follow the question's aspect", () => {
  it("an unlock-chain gap does not appear on an easter-egg question", async () => {
    const r = await ask("easter eggs da missão Hood Safari");
    expect(r.answer).not.toMatch(/Unlock chains/);
  });
  it("a reward gap still appears on a reward question", async () => {
    expect((await ask("Quanto dinheiro eu ganho na missão The Paleto Score?")).answer).toMatch(/Mission money rewards|Heist payouts/);
  });
});

describe("ambiguity", () => {
  it("asks which one when a generic noun has several referents", async () => {
    const casa = await ask("Onde fica a casa?");
    expect(casa.mode).toBe("clarify");
    expect(casa.answer).toMatch(/Michael's House/);
    expect(casa.answer).not.toMatch(/Lighthouse/);
    expect((await ask("Como faço o assalto?")).answer).toMatch(/The Paleto Score/);
    expect((await ask("Como pego a peça?")).answer).toMatch(/Spaceship Parts\*\* ou \*\*Submarine Pieces/);
  });
  it("a demonstrative with nothing to point at and only a protagonist asks what is meant", async () => {
    expect((await ask("Como faço isso com o Trevor?")).mode).toBe("clarify");
  });

  it("answers directly when there is a single referent", async () => {
    const r = await ask("Onde encontro o fantasma?");
    expect(r.mode).not.toBe("clarify");
    expect(r.answer).toMatch(/Mount Gordo/);
  });
});

describe("demo mode (no LLM)", () => {
  it("leads with the kind of thing asked about and does not repeat a sentence", async () => {
    const r = await ask("Onde fica o fantasma do Mount Gordo?");
    expect(r.answer.indexOf("Ghost on Mount Gordo")).toBeLessThan(r.answer.indexOf("### Mount Gordo"));
    const sentence = "Mount Gordo is the third and smallest peak";
    expect(r.answer.split(sentence).length - 1).toBeLessThanOrEqual(1);
  });
});
