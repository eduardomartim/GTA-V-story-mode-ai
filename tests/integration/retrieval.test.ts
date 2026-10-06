import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { extractEntities } from "@/lib/rag/entities";
import { assessEvidence, hybridRetrieve, rerank } from "@/lib/rag/retrieval";
import { analyzeQuery } from "@/lib/rag/understanding";
import { readyDb } from "../helpers";

let db: Db;
beforeAll(async () => {
  db = await readyDb();
});

describe("entity extraction and aliases", () => {
  const ids = async (q: string) => (await extractEntities(q)).entities.map((e) => e.id);
  it.each([
    ["O que o Mike faz?", "character:michael-de-santa"],
    ["Where does Frank live?", "character:franklin-clinton"],
    ["Quem é o Trevor?", "character:trevor-philips"],
    ["Como fazer a joalheria?", "heist:jewel-store-job"],
    ["Tell me about Jewel Store", "heist:jewel-store-job"],
    ["Como fazer o Big Score?", "heist:big-score"],
    ["Como fazer o Big Score?", "mission:the-big-score"],
    ["Onde fica o Peyote?", "collectible:peyote-plants"],
    ["Show me the Space Docker", "vehicle:space-docker"],
    ["Cheat for Super Jump", "cheat:super-jump"],
    ["Quais são os Letter Scraps?", "collectible:letter-scraps"],
  ])("%s → %s", async (q, id) => expect(await ids(q)).toContain(id));

  it("prefers the longest alias (Jewel Store Job over Jewel Store)", async () => {
    const { matches } = await extractEntities("how to do jewel store job");
    expect(matches[0]?.alias).toBe("jewel store job");
  });
  it("flags Online-only entities as such", async () => {
    const { entities } = await extractEntities("How do I do the Cayo Perico Heist?");
    expect(entities.find((e) => e.id === "online_boundary:cayo-perico-heist")?.onlineOnly).toBe(true);
  });
  it("does not hallucinate entities from ordinary words", async () => {
    expect((await extractEntities("qual é a capital da França")).entities).toEqual([]);
  });
});

describe("hybrid retrieval", () => {
  const top = async (q: string, n = 5) => {
    const a = await analyzeQuery(q);
    const r = await hybridRetrieve(db, a);
    return { a, ranked: rerank(r.candidates, a.intents).slice(0, n), all: r };
  };

  it("combines structured, keyword and vector signals", async () => {
    const { all } = await top("Como conseguir o Space Docker?");
    expect(all.counts.entity).toBeGreaterThan(0);
    expect(all.counts.keyword).toBeGreaterThan(0);
    expect(all.counts.vector).toBeGreaterThan(0);
    const via = new Set(all.candidates.flatMap((c) => c.via));
    expect(via).toEqual(new Set(["entity", "keyword", "vector", "graph"]));
  });

  it("finds the right entity for natural-language questions (semantic/keyword, no entity mention)", async () => {
    const { ranked } = await top("how many pieces of trash can I collect around the city for the starlet mission");
    expect(ranked.map((c) => c.entityId)).toContain("collectible:letter-scraps");
  });

  it("uses the knowledge graph to pull related entities (heist → location, setups)", async () => {
    const { all } = await top("Como fazer o Jewel Store Job?");
    const graph = all.candidates.filter((c) => c.via.includes("graph")).map((c) => c.entityId);
    expect(graph).toContain("location:vangelico-jewelry-store");
  });

  it("prefers sections that match the intent (strategy/approaches for heist strategy)", async () => {
    const { ranked } = await top("Qual a melhor abordagem no Big Score?", 3);
    expect(ranked.slice(0, 3).map((c) => c.contentType)).toEqual(expect.arrayContaining(["strategy"]));
  });

  it("NEVER returns Online-only chunks, even for explicit Online questions", async () => {
    for (const q of ["Cayo Perico Heist crew", "Oppressor Mk II", "Diamond Casino heist", "Railgun"]) {
      const a = await analyzeQuery(q);
      const r = await hybridRetrieve(db, a);
      expect(r.candidates.every((c) => !c.entityId.startsWith("online_boundary:"))).toBe(true);
    }
  });

  it("returns only Story Mode chunks", async () => {
    const rows = await db.query<{ n: number }>("select count(*)::int n from chunks where online_only = false and story_mode = false");
    expect(rows[0]?.n).toBe(0);
  });

  it("has sufficient evidence for in-domain questions and none for off-topic ones", async () => {
    const ok = await top("Como funciona o mercado de ações?");
    expect(assessEvidence(ok.a, ok.ranked).sufficient).toBe(true);
    for (const q of ["Qual a capital da França?", "Write me a poem about cats", "how to bake bread"]) {
      const o = await top(q, 12);
      expect(assessEvidence(o.a, o.ranked).sufficient).toBe(false);
    }
  });

  it("source authority breaks ties: higher-authority sources outrank lower ones at equal relevance", async () => {
    const a = await analyzeQuery("Space Docker");
    const r = await hybridRetrieve(db, a);
    const mk = (authority: number) => ({ ...r.candidates[0]!, authority, score: 0, semantic: 0.5, keyword: 0.5, entityScore: 0.5, contentType: "overview", confidence: 1 });
    const [hi, lo] = rerank([mk(3), mk(10)], a.intents);
    expect(hi!.authority).toBe(10);
    expect(lo!.authority).toBe(3);
  });
});

describe("conversation context", () => {
  it("resolves a follow-up to the entities discussed previously", async () => {
    const a = await analyzeQuery("E qual é a melhor abordagem?", [
      { role: "user", content: "Como fazer The Big Score?" },
      { role: "assistant", content: "…", entities: ["heist:big-score", "mission:the-big-score"] },
    ]);
    expect(a.isFollowUp).toBe(true);
    expect(a.inheritedEntities.map((e) => e.id)).toContain("heist:big-score");
  });
  it("does NOT inherit context when the user changes topic", async () => {
    const a = await analyzeQuery("Onde fica o Space Docker?", [
      { role: "assistant", content: "…", entities: ["heist:big-score"] },
    ]);
    expect(a.inheritedEntities).toEqual([]);
  });
  it("does not treat an unrelated standalone question as a follow-up", async () => {
    const a = await analyzeQuery("Qual a capital da França?", [{ role: "assistant", content: "…", entities: ["heist:big-score"] }]);
    expect(a.isFollowUp).toBe(false);
  });
});
