import { toVectorLiteral, type Db } from "@/lib/db/client";
import { embedQuery, getEmbeddingProvider } from "@/lib/ai/embeddings";
import { log } from "@/lib/log";
import type { EntityType } from "@/lib/kb/schema";
import { contentTokens, normalize } from "@/lib/text";
import { expandQuery } from "./glossary";
import type { Candidate, Intent, QueryAnalysis } from "./types";

export interface RetrievalOptions {
  topKKeyword?: number;
  topKVector?: number;
  maxEntityChunks?: number;
  maxGraphEntities?: number;
}

export interface RetrievalResult {
  candidates: Candidate[];
  timings: { keywordMs: number; vectorMs: number; structuredMs: number };
  counts: { keyword: number; vector: number; entity: number; graph: number };
}

interface ChunkRow {
  id: string | number;
  entity_id: string;
  entity_type: EntityType;
  entity_name: string;
  content_type: string;
  content: string;
  source_id: string;
  source_name: string;
  source_type: string;
  source_url: string;
  authority: number;
  confidence: number;
  verification: string;
  spoiler_level: number;
  versions: string[];
}

const CHUNK_SELECT = `
  select c.id, c.entity_id, c.entity_type, e.name as entity_name, c.content_type, c.content, c.source_id,
         s.name as source_name, s.source_type, c.source_url, s.authority, c.confidence, c.knowledge_status as verification, c.spoiler_level, c.versions
  from chunks c
  join entities e on e.id = c.entity_id
  join sources s on s.id = c.source_id`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function toTsQuery(text: string): string | null {
  const terms = [...new Set(contentTokens(text).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length > 1))].slice(0, 24);
  return terms.length ? terms.join(" | ") : null;
}

function toCandidate(r: ChunkRow, via: Candidate["via"][number], extra: Partial<Candidate> = {}): Candidate {
  return {
    chunkId: Number(r.id), entityId: r.entity_id, entityType: r.entity_type, entityName: r.entity_name, contentType: r.content_type,
    content: r.content, sourceId: r.source_id, sourceName: r.source_name, sourceType: r.source_type, sourceUrl: r.source_url, authority: r.authority,
    confidence: r.confidence, verification: r.verification, spoilerLevel: r.spoiler_level, versions: r.versions ?? [],
    semantic: 0, keyword: 0, entityScore: 0, via: [via], score: 0, ...extra,
  };
}

const guard = globalThis as unknown as { __gtaEmbCheck?: Promise<boolean> };

/**
 * Vectors from different embedding models are not comparable (and silently return garbage). The KB records the
 * model used at ingest; if it differs from the runtime provider we disable the vector leg (keyword + structured
 * retrieval keep working) and log once. Fix: set EMBEDDING_PROVIDER back, or re-run `npm run db:seed`.
 */
export function embeddingsCompatible(db: Db): Promise<boolean> {
  guard.__gtaEmbCheck ??= (async () => {
    const current = getEmbeddingProvider();
    const meta = new Map((await db.query<{ key: string; value: string }>("select key, value from kb_meta")).map((m) => [m.key, m.value]));
    const rows = await db.query<{ m: string | null; p: string | null; d: number | null }>(
      "select distinct embedding_model as m, embedding_provider as p, embedding_dimension as d from chunks where embedding is not null");
    const stored = rows.map((x) => `${x.p ?? "?"}/${x.m ?? "?"}/${x.d ?? "?"}`);
    const expected = `${current.provider}/${current.id}/${current.dimension}`;
    const metaOk = meta.size === 0 || (meta.get("embedding_provider") === current.provider && meta.get("embedding_model") === current.id && Number(meta.get("embedding_dimension")) === current.dimension);
    const ok = metaOk && (stored.length === 0 || (stored.length === 1 && stored[0] === expected));
    if (!ok) log("warn", "embedding_model_mismatch", { stored, meta: Object.fromEntries(meta), expected, action: "vector retrieval disabled; re-run npm run db:seed" });
    return ok;
  })();
  return guard.__gtaEmbCheck;
}

export function resetEmbeddingGuard(): void {
  guard.__gtaEmbCheck = undefined;
}

/**
 * Hybrid retrieval: full-text (ts_rank_cd) + vector similarity (pgvector, cosine) + structured entity lookup
 * + one-hop knowledge-graph expansion. Story-Mode-only: Online-only chunks are excluded at the SQL level.
 */
export async function hybridRetrieve(db: Db, analysis: QueryAnalysis, opts: RetrievalOptions = {}): Promise<RetrievalResult> {
  const { topKKeyword = 20, topKVector = 20, maxEntityChunks = 24, maxGraphEntities = 10 } = opts;
  const byChunk = new Map<number, Candidate>();
  const merge = (c: Candidate) => {
    const prev = byChunk.get(c.chunkId);
    if (!prev) return byChunk.set(c.chunkId, c);
    prev.semantic = Math.max(prev.semantic, c.semantic);
    prev.keyword = Math.max(prev.keyword, c.keyword);
    prev.entityScore = Math.max(prev.entityScore, c.entityScore);
    for (const v of c.via) if (!prev.via.includes(v)) prev.via.push(v);
  };

  const expanded = expandQuery(analysis.retrievalQuery);

  // 1) Keyword (full-text)
  let keywordCount = 0;
  const tsq = toTsQuery(expanded);
  const tK = Date.now();
  if (tsq) {
    const rows = await db.query<ChunkRow & { rank: number }>(
      `${CHUNK_SELECT.replace("select c.id,", "select ts_rank_cd(c.tsv, q.query, 32) as rank, c.id,")}, to_tsquery('simple', $1) as q(query)
       where c.tsv @@ q.query and c.online_only = false
       order by rank desc limit $2`,
      [tsq, topKKeyword],
    );
    keywordCount = rows.length;
    const max = Math.max(...rows.map((r) => Number(r.rank)), 0.0001);
    for (const r of rows) merge(toCandidate(r, "keyword", { keyword: Number(r.rank) / max }));
  }
  const keywordMs = Date.now() - tK;

  // 2) Vector (pgvector cosine) — skipped if the stored vectors come from a different embedding model
  const tV = Date.now();
  const vectorOk = await embeddingsCompatible(db);
  const qvec = vectorOk ? await embedQuery(expanded) : [];
  const vrows = !vectorOk ? [] : await db.query<ChunkRow & { sim: number }>(
    `${CHUNK_SELECT.replace("select c.id,", "select 1 - (c.embedding <=> $1::vector) as sim, c.id,")}
     where c.online_only = false and c.embedding is not null
     order by c.embedding <=> $1::vector limit $2`,
    [toVectorLiteral(qvec), topKVector],
  );
  for (const r of vrows) merge(toCandidate(r, "vector", { semantic: clamp01(Number(r.sim)) }));
  const vectorMs = Date.now() - tV;

  // 3) Structured: every chunk of explicitly matched / inherited entities
  const tS = Date.now();
  const explicit = analysis.entities.filter((e) => !e.onlineOnly).slice(0, 6).map((e) => e.id);
  const inherited = analysis.inheritedEntities.filter((e) => !e.onlineOnly).slice(0, 3).map((e) => e.id);
  let entityCount = 0;
  const entityIds = [...new Set([...explicit, ...inherited])];
  if (entityIds.length) {
    const rows = await db.query<ChunkRow>(`${CHUNK_SELECT} where c.entity_id = any($1::text[]) and c.online_only = false order by c.entity_id, c.position limit $2`, [entityIds, maxEntityChunks]);
    entityCount = rows.length;
    for (const r of rows) merge(toCandidate(r, "entity", { entityScore: explicit.includes(r.entity_id) ? 1 : 0.85 }));
  }

  // 4) Knowledge-graph expansion (one hop, both directions, overview chunk of neighbours)
  let graphCount = 0;
  if (entityIds.length) {
    const rel = await db.query<{ nid: string }>(
      `select distinct case when from_id = any($1::text[]) then to_id else from_id end as nid
         from relationships where from_id = any($1::text[]) or to_id = any($1::text[]) limit $2`,
      [entityIds, maxGraphEntities * 3],
    );
    const neighbours = rel.map((r) => r.nid).filter((id) => !entityIds.includes(id)).slice(0, maxGraphEntities);
    if (neighbours.length) {
      const wanted = [...preferredTypes(analysis.intents, analysis.original)];
      const rows = await db.query<ChunkRow>(`${CHUNK_SELECT} where c.entity_id = any($1::text[]) and (c.position = 0 or c.content_type = any($2::text[])) and c.online_only = false`, [neighbours, wanted]);
      graphCount = rows.length;
      const pref = preferredTypes(analysis.intents, analysis.original);
      for (const r of rows) merge(toCandidate(r, "graph", { entityScore: pref.has(r.content_type) ? 0.75 : 0.55 }));
    }
  }
  const structuredMs = Date.now() - tS;

  return { candidates: [...byChunk.values()], timings: { keywordMs, vectorMs, structuredMs }, counts: { keyword: keywordCount, vector: vrows.length, entity: entityCount, graph: graphCount } };
}

/* ───────────────────────── reranking ───────────────────────── */

const PREFERRED_TYPES: Partial<Record<Intent, string[]>> = {
  mission_unlock: ["requirements"], mission_requirements: ["requirements"],
  mission_walkthrough: ["objectives", "gold", "failure", "walkthrough", "steps", "location"], mission_help: ["objectives", "gold", "failure", "location", "assassination"],
  mission_reward: ["reward", "money", "assassination"], heist_strategy: ["strategy", "approaches", "crew", "money"], money: ["money", "strategy"],
  stock_market: ["money", "strategy", "timing"], troubleshooting: ["steps", "causes", "technical"], version_difference: ["versions"], ending: ["guidance"],
  cheat: ["warning", "platforms"], "100_percent_completion": ["requirements", "weights", "misc", "exclusions", "disambiguation", "completion"],
  collectible_lookup: ["requirements", "completion", "details", "versions"], location_lookup: ["location"], activity: ["details"],
};

/** Words in the question that point at a specific kind of section, independent of the classified intent. */
const TYPE_HINTS: Array<[RegExp, string[]]> = [
  [/\b(fail\w*|falh\w*|perd\w*|lose|game over)\b/, ["failure"]],
  [/\b(gold|ouro|medal\w*|medalh\w*|objectives?|objetivos?|how do i (do|complete)|como (completo|faco|fazer))\b/, ["gold", "objectives"]],
  [/\b(worth|weights?|percent\w*|pesos?|vale|valor)\b/, ["weights"]],
  [/\b(misc\w*|diversas?|obrigatori\w*|required|requisitos?)\b/, ["misc", "requirements"]],
  [/\b(count\w*|conta\w*|contam|completion)\b/, ["completion", "exclusions"]],
  [/\b(approach\w*|abordagem|abordagens|subtle|obvious|smart|loud|sutil|diferenca)\b/, ["approaches"]],
  [/\b(how much|quanto|make|ganh\w*|rende|paga\w*|earn|profit|lucro|returns?|retorno|payout|pays?)\b/, ["money"]],
  [/\b(strategy|estrategia|tips?|dicas?|melhor|best|recommend\w*)\b/, ["strategy"]],
  [/\b(crew|equipe|gunman|driver|hacker|cuts?|escolher|contratar|choose|hire|pick)\b/, ["crew"]],
  [/\b(where|onde|location|local)\b/, ["location"]],
  [/\b(target|alvo|quem (e|era) o alvo)\b/, ["assassination", "objectives"]],
  [/\b(acoes|stocks?|invest\w*|comprar|buy|sell|vender)\b/, ["money", "strategy"]],
  [/\b(ordem|order|plano|plan|passos?|steps?|pratic\w*|practical)\b/, ["steps"]],
];

export function hintedTypes(question: string): Set<string> {
  const n = normalize(question);
  const out = new Set<string>();
  for (const [re, types] of TYPE_HINTS) if (re.test(n)) types.forEach((t) => out.add(t));
  return out;
}

/** Section kinds worth favouring: those implied by the intents plus those the wording points at explicitly. */
export function preferredTypes(intents: Intent[], question: string): Set<string> {
  return new Set([...intents.flatMap((i) => PREFERRED_TYPES[i] ?? []), ...hintedTypes(question)]);
}

export const WEIGHTS = { semantic: 0.34, keyword: 0.22, entity: 0.24, authority: 0.08, contentType: 0.08, story: 0.04 } as const;

/** Weighted score: semantic + keyword + entity match + source authority + content type + Story Mode relevance. */
export function rerank(candidates: Candidate[], intents: Intent[], question = ""): Candidate[] {
  const maxSem = Math.max(...candidates.map((c) => c.semantic), 0);
  const preferred = preferredTypes(intents, question);
  const hinted = hintedTypes(question);
  for (const c of candidates) {
    const sem = maxSem > 0.15 ? c.semantic / maxSem : c.semantic;
    const typeScore = hinted.has(c.contentType) ? 1 : preferred.has(c.contentType) ? 0.8 : c.contentType === "overview" ? 0.5 : 0.25;
    c.score =
      WEIGHTS.semantic * sem + WEIGHTS.keyword * c.keyword + WEIGHTS.entity * c.entityScore + WEIGHTS.authority * (c.authority / 10) +
      WEIGHTS.contentType * typeScore + WEIGHTS.story * 1; // Online-only chunks never reach this point
    // A section of an explicitly-referenced entity that matches the intent (e.g. strategy for a heist) should dominate.
    if (c.entityScore >= 0.7 && preferred.has(c.contentType)) c.score += hinted.has(c.contentType) ? 0.35 : 0.12;
    if (c.contentType === "list") c.score += 0.4; // exhaustive structured SQL result for "all …" questions
    c.score *= 0.6 + 0.4 * clamp01(c.confidence);
  }
  return [...candidates].sort((a, b) => b.score - a.score);
}

/* ───────────────────────── evidence sufficiency ───────────────────────── */

const GENERIC_TERMS = new Set([
  "gta", "grand", "theft", "auto", "five", "game", "jogo", "story", "mode", "modo", "historia", "mission", "missao", "missoes", "missions",
  "gtav", "online", "faco", "fazer", "como", "info", "informacao", "informacoes", "tudo", "todos", "todas", "all", "list", "lista", "quais",
  "best", "melhor", "need", "preciso", "work", "works", "funciona", "explain", "explique", "tell", "diga", "show", "mostre", "mostra", "get", "consigo",
  "conseguir", "unlock", "liberar", "requirements", "requisitos", "location", "localizacao", "where", "onde", "fica", "reward", "recompensa",
  "walkthrough", "step", "passo", "guide", "guia", "map", "mapa", "image", "imagem", "estrategia", "strategy", "approach", "abordagem",
  "custa", "custo", "preco", "price", "cost", "dica", "tip", "quanto", "quantos", "quantas", "much", "desbloqueio", "desbloquear", "desbloqueia", "libero", "libera", "liberar", "isso", "esse", "essa",
]);

export function topicalTerms(query: string): string[] {
  return contentTokens(query).filter((t) => t.length >= 3 && !GENERIC_TERMS.has(t) && !/^\d+$/.test(t));
}

export interface EvidenceAssessment {
  sufficient: boolean;
  reason: string;
  topicalTerms: string[];
}

export function assessEvidence(analysis: QueryAnalysis, ranked: Candidate[]): EvidenceAssessment {
  // Terms are taken from the glossary-expanded question so Portuguese words that have an English equivalent can match the KB.
  const terms = [...new Set(topicalTerms(expandQuery(analysis.original)))];
  const explicitEntity = analysis.entities.length > 0 && ranked.some((c) => c.entityScore >= 1);
  if (explicitEntity) return { sufficient: true, reason: "entity-match", topicalTerms: terms };
  const inheritedEntity = analysis.inheritedEntities.length > 0 && ranked.some((c) => c.entityScore >= 0.85);

  const stem = (t: string) => t.slice(0, Math.max(4, Math.min(t.length, 6)));
  const text = ` ${normalize(ranked.slice(0, 12).map((c) => c.content).join(" "))} `;
  const hits = terms.filter((t) => text.includes(` ${t}`) || text.includes(` ${stem(t)}`)).length;
  const bestSem = Math.max(...ranked.map((c) => c.semantic), 0);
  const bestKw = Math.max(...ranked.map((c) => c.keyword), 0);

  if (inheritedEntity && (terms.length === 0 || hits >= 1 || analysis.intents[0] !== "general_question")) return { sufficient: true, reason: "follow-up", topicalTerms: terms };
  if (terms.length === 0) {
    // Only generic words ("how do I unlock a mission?"): need decent semantic or keyword support.
    const ok = ranked.length > 0 && (bestSem >= 0.2 || bestKw >= 0.6) && analysis.intents[0] !== "general_question";
    return { sufficient: ok, reason: ok ? "generic-intent-support" : "no-topical-terms", topicalTerms: terms };
  }
  // Without an entity, a single stray word shared with the KB is not evidence: longer questions need two matching terms.
  const needed = terms.length >= 3 ? 2 : 1;
  if (hits >= needed && (bestSem >= 0.1 || bestKw > 0)) return { sufficient: true, reason: "topical-term-hit", topicalTerms: terms };
  return { sufficient: false, reason: "no-evidence", topicalTerms: terms };
}
