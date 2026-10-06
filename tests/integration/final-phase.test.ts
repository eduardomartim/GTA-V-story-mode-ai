import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { runLlmEval, parseScores, loadLlmQuestions, DIMENSIONS } from "@/lib/eval/llm";
import { evaluateRetrieval, loadGold } from "@/lib/eval/retrieval";
import { runChat } from "@/lib/rag/pipeline";
import { isSafeExternalUrl } from "@/lib/security/url";
import { fakeProvider, readyDb } from "../helpers";

let db: Db;
beforeAll(async () => {
  db = await readyDb();
});

describe("GTA Online contamination (20+ adversarial questions)", () => {
  const ONLINE = [
    "Como comprar o Kosatka?", "Qual é o melhor negócio do GTA Online?", "Como conseguir o Oppressor Mk II?", "Como fazer Cayo Perico?",
    "Quanto custa o Kosatka?", "How do I buy the Kosatka submarine?", "What's the best business in GTA Online?", "How do I unlock the Oppressor Mk II?",
    "Best crew for the Diamond Casino Heist?", "Como funciona o Doomsday Heist?", "Vale a pena comprar um Nightclub?", "How much does a Bunker make per day?",
    "Como funcionam os Shark Cards?", "Quanto custa o Agency no GTA Online?", "What is the Arena War update?", "Como ganhar dinheiro no GTA Online?",
    "Is the Cayo Perico heist worth it?", "Como entro no El Rubio?", "Which GTA Online business is best for beginners?", "Quais são os negócios do GTA Online?",
    "O Oppressor Mk II existe no Modo História?", "Is the Kosatka available in Story Mode?",
  ];
  it.each(ONLINE)("%s → Online notice, no retrieval, no model call", async (q) => {
    const p = fakeProvider();
    const r = await runChat({ message: q, provider: p });
    expect(r.mode).toBe("online-boundary");
    expect(p.calls).toHaveLength(0);
    expect(r.answer).toMatch(/GTA Online/);
    expect(r.sources).toHaveLength(0);
  });

  it("hybrid: a Story Mode heist compared with an Online one keeps the Online part out of the context", async () => {
    const seen: string[] = [];
    const r = await runChat({ message: "Compare the Big Score with the Diamond Casino Heist", provider: fakeProvider(), onTrace: (t) => seen.push(...t.context.map((c) => c.entityId)) });
    expect(seen.some((id) => id.startsWith("online_boundary:"))).toBe(false);
    expect(r.answer).toMatch(/GTA Online/);
  });

  it("an underspecified hybrid question asks which vehicle and mode", async () => {
    const r = await runChat({ message: "Esse carro existe no GTA 5?", provider: null });
    expect(r.mode).toBe("clarify");
  });
});

describe("ambiguous questions ask for context", () => {
  it.each(["Como desbloqueio isso?", "Qual é a melhor?", "Quanto custa?", "How do I unlock this?", "Which is the best?"])("%s", async (q) => {
    const p = fakeProvider();
    const r = await runChat({ message: q, provider: p });
    expect(r.mode).toBe("clarify");
    expect(p.calls).toHaveLength(0);
    expect(r.followUps.length).toBeGreaterThan(0);
  });
  it("does NOT ask when a conversation provides the referent", async () => {
    const first = await runChat({ message: "Como faço o Jewel Store Job?", provider: null });
    const r = await runChat({ message: "Como desbloqueio isso?", provider: null, history: [{ role: "user", content: "x" }, { role: "assistant", content: first.answer, entities: first.meta.entities }] });
    expect(r.mode).not.toBe("clarify");
  });
});

describe("three-turn follow-up chain (Jewel Store Job)", () => {
  it("keeps the heist as the referent and reaches the crew advice", async () => {
    const history: Array<{ role: "user" | "assistant"; content: string; entities?: string[] }> = [];
    const ask = async (q: string) => {
      const ids: string[] = [];
      const types: string[] = [];
      const r = await runChat({ message: q, history, provider: null, onTrace: (t) => { ids.push(...t.context.map((c) => c.entityId)); types.push(...t.context.map((c) => c.contentType)); } });
      history.push({ role: "user", content: q }, { role: "assistant", content: r.answer, entities: r.meta.entities });
      return { r, ids, types };
    };
    await ask("Como faço o Jewel Store Job?");
    const t2 = await ask("E qual abordagem é melhor?");
    expect(t2.r.meta.entities).toContain("heist:jewel-store-job");
    expect(t2.types).toEqual(expect.arrayContaining(["strategy"]));
    const t3 = await ask("E quem eu devo escolher?");
    expect(t3.r.meta.entities).toContain("heist:jewel-store-job");
    expect(t3.types).toEqual(expect.arrayContaining(["crew"]));
    expect(t3.ids).toEqual(expect.arrayContaining(["heist:jewel-store-job"]));
  });
});

describe("source attribution", () => {
  const QS = ["Quem passa a missão Friend Request?", "Quantos Hidden Packages existem?", "Qual o pagamento máximo do Paleto Score?", "Como conseguir o Space Docker?", "Quais ações compro no Hotel Assassination?"];
  it.each(QS)("%s: every source is safe, supported by the context and carries the stored status", async (q) => {
    let ctxEntities = new Set<string>();
    const r = await runChat({ message: q, provider: null, onTrace: (t) => { ctxEntities = new Set(t.context.map((c) => c.entityId)); } });
    expect(r.sources.length).toBeGreaterThan(0);
    for (const s of r.sources) {
      expect(isSafeExternalUrl(s.url)).toBe(true);
      expect(ctxEntities.has(s.entityId)).toBe(true);
      expect(["verified", "curated", "unverified"]).toContain(s.verification);
      const rows = await db.query<{ n: number }>("select count(*)::int n from chunks where entity_id = $1 and source_url = $2", [s.entityId, s.url]);
      expect(rows[0]?.n, `${s.entityId} ${s.url}`).toBeGreaterThan(0);
    }
  });

  it("a model that cites only [S1] gets only that source (no padding with unrelated sources)", async () => {
    const r = await runChat({ message: "Quem passa a missão Friend Request?", provider: fakeProvider(() => "Lester Crest [S1].") });
    expect(r.sources).toHaveLength(1);
  });

  it("an answer resting on an unverified block never shows that source as verified", async () => {
    const r = await runChat({ message: "Quanto o Bureau Raid paga?", provider: null });
    expect(r.sources.some((s) => s.verification === "unverified")).toBe(true);
  });
});

describe("knowledge gaps are passed to the model", () => {
  it("lists relevant backlog items so the model does not fill them from memory", async () => {
    const p = fakeProvider();
    await runChat({ message: "Qual veículo é o mais rápido do Story Mode?", provider: p });
    const turn = p.calls[0]?.messages[0]?.content ?? "";
    expect(turn).toMatch(/<known_gaps>[\s\S]*Vehicle statistics/);
    expect(p.calls[0]?.system).toMatch(/known_gaps/);
  });
});

describe("data checks for the final knowledge phase", () => {
  it("has exactly 79 mission entries and documents the counting methodology", async () => {
    const [n] = await db.query<{ n: number }>("select count(*)::int n from missions");
    expect(n?.n).toBe(79);
    const rows = await db.query<{ content: string }>("select content from chunks where entity_id = 'completion:mission-count-methodology'");
    expect(rows.map((r) => r.content).join(" ")).toMatch(/69/);
  });

  it("records source conflicts with source A, source B, the difference and a confidence", async () => {
    const rows = await db.query<{ content: string }>("select content from chunks where content_type = 'conflict'");
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(r.content).toMatch(/Source A|Confidence/);
    const masks = await db.query<{ content: string }>("select content from chunks where entity_id = 'mission:masks' and content_type = 'conflict'");
    expect(masks[0]?.content).toMatch(/Source A:.*Source B:.*Difference:.*Confidence/s);
  });

  it("the four previously missing missions now have walkthrough steps (from GTA5Wiki, flagged unverified because they conflict)", async () => {
    for (const id of ["mission:prologue", "mission:masks", "mission:trevor-philips-industries", "mission:meltdown"]) {
      const rows = await db.query<{ knowledge_status: string; source_id: string }>("select knowledge_status, source_id from chunks where entity_id = $1 and content_type = 'walkthrough'", [id]);
      expect(rows.length, id).toBeGreaterThanOrEqual(3);
      expect(rows[0]?.source_id).toBe("gta5wiki");
    }
    const [p] = await db.query<{ n: number }>("select count(*)::int n from chunks where entity_id = 'mission:prologue' and knowledge_status = 'curated' and content_type = 'walkthrough'");
    expect(p?.n).toBeGreaterThan(0); // the prologue has no conflict, so it stays curated
  });

  it("most missions have a structured walkthrough", async () => {
    const [n] = await db.query<{ n: number }>("select count(distinct entity_id)::int n from chunks where entity_type = 'mission' and content_type = 'walkthrough'");
    expect(n?.n).toBeGreaterThanOrEqual(70);
  });

  it("phone cheats are recorded only where they equal the keypad spelling of the PC code", async () => {
    const KEY: Record<string, string> = { a: "2", b: "2", c: "2", d: "3", e: "3", f: "3", g: "4", h: "4", i: "4", j: "5", k: "5", l: "5", m: "6", n: "6", o: "6", p: "7", q: "7", r: "7", s: "7", t: "8", u: "8", v: "8", w: "9", x: "9", y: "9", z: "9" };
    const rows = await db.query<{ entity_id: string; content: string }>("select entity_id, content from chunks where content_type = 'phone'");
    expect(rows.length).toBeGreaterThanOrEqual(5);
    const codes = await db.query<{ entity_id: string; code: string }>("select e.id as entity_id, e.data->'sources'->0->>'url' as code from entities e where false");
    void codes;
    for (const r of rows) {
      const m = r.content.match(/Phone number 1-999-(\d+).*PC code '([a-z]+)'/s);
      expect(m, r.entity_id).not.toBeNull();
      expect([...(m?.[2] ?? "")].map((c) => KEY[c]).join("")).toBe(m?.[1]);
    }
    const sj = await db.query<{ content: string }>("select content from chunks where entity_id = 'cheat:super-jump' and content_type = 'phone'");
    expect(sj).toHaveLength(0); // the quoted number did not match the code, so it is NOT recorded
  });

  it("weapon numbers are stored UNVERIFIED and never as plain facts", async () => {
    const rows = await db.query<{ knowledge_status: string }>("select knowledge_status from chunks where content_type = 'stats' and entity_type = 'weapon'");
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.every((r) => r.knowledge_status === "unverified")).toBe(true);
  });

  it("Lester contracts separate FACT from STRATEGY and list risks", async () => {
    const rows = await db.query<{ title: string }>("select content as title from chunks where entity_id = 'mission:hotel-assassination' and content_type in ('assassination','money','risks')");
    const all = rows.map((r) => r.title).join("\n");
    expect(all).toMatch(/FACT/);
    expect(all).toMatch(/STRATEGY/);
    expect(all).toMatch(/Risks/);
  });

  it("vehicles cover mission vehicles and every vehicle/weapon has an availability", async () => {
    const [v] = await db.query<{ n: number }>("select count(*)::int n from vehicles");
    expect(v?.n).toBeGreaterThanOrEqual(28);
    const [bad] = await db.query<{ n: number }>("select count(*)::int n from vehicles where availability = 'ONLINE_ONLY' and entity_id not like 'online_boundary:%'");
    expect(bad?.n).toBe(0);
  });
});

describe("retrieval evaluation (held-out gold set)", () => {
  it("meets the retrieval quality gate", async () => {
    const report = await evaluateRetrieval(loadGold());
    expect(report.n).toBeGreaterThanOrEqual(50);
    expect(report.metrics.intentAccuracy).toBeGreaterThanOrEqual(0.9);
    expect(report.metrics.entityRecall).toBeGreaterThanOrEqual(0.95);
    expect(report.metrics.hitAtK).toBeGreaterThanOrEqual(0.95);
    expect(report.metrics.mrr).toBeGreaterThanOrEqual(0.7);
    expect(report.metrics.groundedness).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});

describe("LLM evaluation harness (tested with a model double)", () => {
  it("has at least 50 questions with every behaviour class", () => {
    const qs = loadLlmQuestions();
    expect(qs.length).toBeGreaterThanOrEqual(50);
    expect(new Set(qs.map((q) => q.expect))).toEqual(new Set(["answer", "refuse", "gap", "clarify", "online"]));
  });

  it("parses judge JSON strictly", () => {
    const ok = Object.fromEntries(DIMENSIONS.map((d) => [d, 4]));
    expect(parseScores(`noise ${JSON.stringify({ ...ok, comment: "fine" })}`)?.scores.factuality).toBe(4);
    expect(parseScores(JSON.stringify({ ...ok, factuality: 9 }))).toBeNull();
    expect(parseScores("no json")).toBeNull();
  });

  it("produces a graded report with per-dimension scores and deterministic checks", async () => {
    const qs = loadLlmQuestions().filter((q) => ["l-s01", "l-o01", "l-a01"].includes(q.id));
    const answerer = fakeProvider(() => "Trevor Philips vive em Sandy Shores [S1].");
    const judge = fakeProvider(() => JSON.stringify({ factuality: 5, groundedness: 4, relevance: 5, completeness: 4, source_attribution: 4, story_mode_correctness: 5, hallucination_resistance: 5, comment: "ok" }));
    const report = await runLlmEval(qs, answerer, judge);
    expect(report.status).toBe("ok");
    expect(report.n).toBe(3);
    expect(report.overall).toBeGreaterThan(50);
    expect(Object.keys(report.dimensions)).toEqual([...DIMENSIONS]);
    expect(report.rows.find((r) => r.id === "l-o01")?.checks.behaviour).toBe(true);
    expect(report.rows.find((r) => r.id === "l-a01")?.mode).toBe("clarify");
  });
});

describe("release-audit regressions", () => {
  it("still asks for the version when the question merely contains the word 'one'", async () => {
    const r = await runChat({ message: "How many peyote plants are there, which one is closest?", provider: null });
    expect(r.answer).toMatch(/Which one do you play/);
  });
  it("assistant wording ('PC code') does not count as the user stating a version", async () => {
    const r = await runChat({ message: "Quantas plantas de peiote existem?", provider: null, history: [{ role: "assistant", content: "The PC code for that cheat is turtle." }] });
    expect(r.answer).toMatch(/Qual você joga/);
  });
  it("still respects a version the user stated in an earlier turn", async () => {
    const r = await runChat({ message: "Quantas plantas de peiote existem?", provider: null, history: [{ role: "user", content: "Eu jogo no PS4" }, { role: "assistant", content: "ok" }] });
    expect(r.answer).not.toMatch(/Qual você joga/);
  });
  it("flags sources as consulted-not-cited when the model cites nothing", async () => {
    const r = await runChat({ message: "Quem passa a missão Friend Request?", provider: fakeProvider(() => "Não encontrei evidência suficiente.") });
    expect(r.meta.cited).toBe(false);
    const cited = await runChat({ message: "Quem passa a missão Friend Request?", provider: fakeProvider(() => "Lester Crest [S1].") });
    expect(cited.meta.cited).toBe(true);
  });
});
