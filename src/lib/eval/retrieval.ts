import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runChat } from "@/lib/rag/pipeline";
import type { Candidate, QueryAnalysis } from "@/lib/rag/types";
import { INTENTS } from "@/lib/rag/types";
import { normalize } from "@/lib/text";

const Gold = z.object({
  id: z.string(),
  q: z.string(),
  intent: z.enum(INTENTS),
  entities: z.array(z.string()),
  relevant: z.array(z.string()),
  facts: z.array(z.string()),
  expect_gap: z.boolean().optional(),
});
export type GoldItem = z.infer<typeof Gold>;

export interface RetrievalRow {
  id: string;
  intentHit: boolean;
  entityRecall: number;
  entityPrecision: number;
  precisionAtK: number;
  hitAtK: boolean;
  recall: number;
  mrr: number;
  sourceRelevance: number;
  groundedness: number;
  k: number;
}

export interface RetrievalReport {
  n: number;
  metrics: Record<"intentAccuracy" | "entityRecall" | "entityPrecision" | "precisionAtK" | "hitAtK" | "recall" | "mrr" | "sourceRelevance" | "groundedness", number>;
  worst: Array<{ id: string; q: string; issue: string }>;
  rows: RetrievalRow[];
}

export const loadGold = (file = path.join(process.cwd(), "eval", "retrieval-gold.json")): GoldItem[] => z.array(Gold).parse(JSON.parse(fs.readFileSync(file, "utf8")));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 1);

/**
 * Retrieval evaluation (no LLM): intent accuracy, entity extraction accuracy, precision/recall/MRR of the context actually sent
 * to the generator, relevance of the cited sources, and groundedness (are the facts needed to answer inside the context?).
 * The gold set is held out: it is NOT used to build or tune the knowledge base.
 */
export async function evaluateRetrieval(items: GoldItem[]): Promise<RetrievalReport> {
  const rows: RetrievalRow[] = [];
  const worst: RetrievalReport["worst"] = [];
  for (const g of items) {
    let ctx: Candidate[] = [];
    let analysis: QueryAnalysis | undefined;
    const res = await runChat({ message: g.q, provider: null, onTrace: (t) => { ctx = t.context; analysis = t.analysis; } });
    const relevant = new Set([...g.relevant, ...g.entities]);
    const extracted = [...(analysis?.entities ?? []), ...(analysis?.inheritedEntities ?? [])].map((e) => e.id);
    const ctxEntities = new Set(ctx.map((c) => c.entityId));
    const firstRel = ctx.findIndex((c) => relevant.has(c.entityId));
    const text = normalize(ctx.map((c) => c.content).join(" "));
    const factHit = g.facts.length ? g.facts.filter((f) => text.includes(normalize(f))).length / g.facts.length : 1;
    const gapOk = g.expect_gap ? (res.meta.gaps?.length ?? 0) > 0 || res.mode === "no-evidence" || /not validated|nao validad/.test(text) : true;
    const row: RetrievalRow = {
      id: g.id,
      intentHit: (analysis?.intents ?? []).slice(0, 3).includes(g.intent),
      entityRecall: g.entities.length ? g.entities.filter((e) => extracted.includes(e)).length / g.entities.length : 1,
      entityPrecision: extracted.length ? extracted.filter((e) => relevant.has(e)).length / extracted.length : 1,
      precisionAtK: ctx.length ? ctx.filter((c) => relevant.has(c.entityId)).length / ctx.length : 0,
      hitAtK: firstRel >= 0,
      recall: [...relevant].filter((e) => ctxEntities.has(e)).length / relevant.size,
      mrr: firstRel >= 0 ? 1 / (firstRel + 1) : 0,
      sourceRelevance: res.sources.length ? res.sources.filter((s) => relevant.has(s.entityId)).length / res.sources.length : 1,
      groundedness: g.expect_gap ? (gapOk ? 1 : 0) : factHit,
      k: ctx.length,
    };
    rows.push(row);
    const issues = [!row.intentHit && `intent ${g.intent} not in ${analysis?.intents.join(",")}`, row.entityRecall < 1 && "entity not extracted", !row.hitAtK && "no relevant chunk in context", row.groundedness < 1 && "facts missing from context"].filter(Boolean);
    if (issues.length) worst.push({ id: g.id, q: g.q, issue: issues.join("; ") });
  }
  const m = (k: keyof RetrievalRow) => mean(rows.map((r) => (typeof r[k] === "boolean" ? Number(r[k]) : (r[k] as number))));
  return {
    n: rows.length, rows, worst,
    metrics: { intentAccuracy: m("intentHit"), entityRecall: m("entityRecall"), entityPrecision: m("entityPrecision"), precisionAtK: m("precisionAtK"), hitAtK: m("hitAtK"), recall: m("recall"), mrr: m("mrr"), sourceRelevance: m("sourceRelevance"), groundedness: m("groundedness") },
  };
}
