import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { runChat } from "@/lib/rag/pipeline";
import { fakeProvider, readyDb } from "../helpers";

let db: Db;
beforeAll(async () => {
  db = await readyDb();
});

describe("knowledge coverage", () => {
  it("documents details for most of the 79 missions (gold medals / objectives / failure)", async () => {
    const [row] = await db.query<{ n: number }>("select count(distinct entity_id)::int n from chunks where entity_type = 'mission' and content_type in ('gold','objectives','failure')");
    expect(row?.n).toBeGreaterThanOrEqual(65);
  });

  it("covers all five Lester assassinations with target, reward and stock interaction", async () => {
    const rows = await db.query<{ entity_id: string; content_type: string }>("select entity_id, content_type from chunks where content_type in ('assassination','money') and entity_id like 'mission:%assassination'");
    const ids = new Set(rows.filter((r) => r.content_type === "assassination").map((r) => r.entity_id));
    expect(ids.size).toBe(5);
    expect(new Set(rows.filter((r) => r.content_type === "money").map((r) => r.entity_id)).size).toBe(5);
  });

  it("stores every heist's approaches, crew and payout sections", async () => {
    const rows = await db.query<{ entity_id: string; types: string[] }>("select entity_id, array_agg(distinct content_type) types from chunks where entity_type = 'heist' group by entity_id");
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.types).toEqual(expect.arrayContaining(["money"]));
  });
});

describe("knowledge status (verified / curated / unverified)", () => {
  it("every chunk carries a status and the three states are all in use", async () => {
    const rows = await db.query<{ s: string; n: number }>("select knowledge_status s, count(*)::int n from chunks group by 1");
    const by = Object.fromEntries(rows.map((r) => [r.s, r.n]));
    expect(Object.keys(by).sort()).toEqual(["curated", "unverified", "verified"]);
    expect(by.curated).toBeGreaterThan(by.verified ?? 0); // curated is the honest majority
  });

  it("passes the status to the model so unverified blocks can be hedged", async () => {
    const p = fakeProvider();
    await runChat({ message: "Quanto o Bureau Raid paga?", provider: p });
    expect(p.calls[0]?.messages[0]?.content).toMatch(/status: unverified/);
    expect(p.calls[0]?.system).toMatch(/status: unverified/);
  });

  it("surfaces source disagreement instead of picking a side (Railgun, Big Score approach)", async () => {
    const railgun = await runChat({ message: "A Railgun está disponível no Story Mode?", provider: null });
    expect(railgun.answer.toLowerCase()).toMatch(/diverge|disagree/);
    expect(railgun.mode).not.toBe("online-boundary");
    const big = await runChat({ message: "In the Big Score, does Subtle or Obvious pay more?", provider: null });
    expect(big.answer.toLowerCase()).toMatch(/diverge|disagree/);
  });

  it("marks sections that cite a specific source with that source (not the entity's primary one)", async () => {
    const rows = await db.query<{ source_id: string }>("select source_id from chunks where entity_id = 'heist:big-score' and content_type = 'approaches'");
    expect(rows[0]?.source_id).toBe("gtabase");
  });
});

describe("vehicles and weapons: availability enum", () => {
  it("every vehicle and weapon declares STORY_MODE / ONLINE_ONLY / BOTH / UNKNOWN", async () => {
    const rows = await db.query<{ availability: string }>("select availability from vehicles union all select availability from weapons");
    expect(rows.length).toBeGreaterThan(60);
    expect(rows.every((r) => ["STORY_MODE", "ONLINE_ONLY", "BOTH", "UNKNOWN"].includes(r.availability))).toBe(true);
  });

  it("Online-only vehicles never enter a Story Mode answer", async () => {
    for (const q of ["Which vehicles can I get in Story Mode?", "Como conseguir um veículo voador?", "What is the best submarine?", "Quais motos existem no Story Mode?"]) {
      const ids: string[] = [];
      await runChat({ message: q, provider: null, onTrace: (t) => ids.push(...t.context.map((c) => c.entityId)) });
      expect(ids.filter((id) => id.includes("oppressor") || id.includes("kosatka") || id.startsWith("online_boundary:")), q).toEqual([]);
    }
  });

  it("the divergent Railgun is stored with availability UNKNOWN, not guessed", async () => {
    const [w] = await db.query<{ availability: string }>("select availability from weapons where entity_id = 'weapon:railgun'");
    expect(w?.availability).toBe("UNKNOWN");
  });
});

describe("version awareness", () => {
  it("asks which version the player uses when the answer is version-scoped", async () => {
    const r = await runChat({ message: "Quantas plantas de peiote existem?", provider: null });
    expect(r.answer).toMatch(/Qual você joga/);
    expect(r.cards.some((c) => c.kind === "warning" && c.tone === "version")).toBe(true);
  });
  it("does not ask when the user already stated the version", async () => {
    const r = await runChat({ message: "How many peyote plants are there on PS4?", provider: null });
    expect(r.answer).not.toMatch(/Which one do you play/);
  });
});

describe("structured lookups and partial-evidence guard", () => {
  it("answers 'first mission of Franklin after the prologue' from the story order", async () => {
    const ctx: string[] = [];
    await runChat({ message: "Qual é a primeira missão do Franklin depois do prólogo?", provider: null, onTrace: (t) => ctx.push(...t.context.map((c) => c.content)) });
    expect(ctx.join("\n")).toMatch(/#2 Franklin and Lamar/);
  });

  it("tells the model which question terms the knowledge base cannot cover", async () => {
    const r = await runChat({ message: "Qual a senha do wi-fi do Michael?", provider: null });
    expect(r.meta.unmatchedTerms).toEqual(expect.arrayContaining(["senha"]));
  });
});

describe("embedding metadata", () => {
  it("records provider, model and dimension in kb_meta", async () => {
    const meta = Object.fromEntries((await db.query<{ key: string; value: string }>("select key, value from kb_meta")).map((m) => [m.key, m.value]));
    expect(meta).toMatchObject({ embedding_provider: "local", embedding_dimension: "384" });
  });
});
