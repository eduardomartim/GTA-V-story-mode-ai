import { toVectorLiteral, type Db } from "@/lib/db/client";
import { embedQuery, getEmbeddingProvider } from "@/lib/ai/embeddings";
import { log } from "@/lib/log";
import type { EntityType } from "@/lib/kb/schema";
import { contentTokens, normalize } from "@/lib/text";
import { CANONICAL_TERMS, expandQuery } from "./glossary";
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
  const all = [...new Set(contentTokens(text).map((t) => t.replace(/[^a-z0-9]/g, "")).filter((t) => t.length > 1))];
  // Generic words ("story", "mode", "mission", "where"…) occur in thousands of chunks — every overview starts with
  // "GTA V Story Mode" — and would drown the specific terms. They are only used when nothing specific remains.
  const specific = all.filter((t) => !GENERIC_TERMS.has(t));
  const terms = (specific.length ? specific : all).slice(0, 24);
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

  // 3) Entity-first: every chunk of explicitly named / inherited entities. Explicit entities outrank everything.
  const tS = Date.now();
  const explicit = analysis.entities.filter((e) => !e.onlineOnly).slice(0, 6).map((e) => e.id);
  const inherited = analysis.inheritedEntities.filter((e) => !e.onlineOnly).slice(0, 3).map((e) => e.id);
  let entityCount = 0;
  const entityIds = [...new Set([...explicit, ...inherited])];
  if (entityIds.length) {
    const rows = await db.query<ChunkRow>(`${CHUNK_SELECT} where c.entity_id = any($1::text[]) and c.online_only = false order by c.entity_id, c.position limit $2`, [entityIds, maxEntityChunks]);
    entityCount = rows.length;
    for (const r of rows) merge(toCandidate(r, "entity", { entityScore: explicit.includes(r.entity_id) ? 1 : ENTITY_SCORE.inherited }));
  }

  // 4) Partial name match: specific question words that occur in an entity's NAME ("fantasma" → "ghost" →
  //    "Ghost on Mount Gordo"). Strong when ≥ 2 words match or when the entity is linked to a named entity.
  const nameHits = await nameMatches(db, analysis, expanded, entityIds);
  if (nameHits.length) {
    const wanted = [...preferredTypes(analysis.intents, analysis.original)];
    const rows = await db.query<ChunkRow>(`${CHUNK_SELECT} where c.entity_id = any($1::text[]) and (c.position = 0 or c.content_type = any($2::text[])) and c.online_only = false`, [nameHits.map((h) => h.id), wanted]);
    const score = new Map(nameHits.map((h) => [h.id, h.score]));
    for (const r of rows) merge(toCandidate(r, "entity", { entityScore: score.get(r.entity_id) ?? ENTITY_SCORE.nameWeak }));
  }

  // 5) Knowledge-graph expansion: one hop, both directions, edges weighted by predicate × intent (see edgeWeight).
  let graphCount = 0;
  const anchors = [...new Set([...explicit, ...inherited])];
  if (anchors.length) {
    const edges = await db.query<{ from_id: string; predicate: string; to_id: string; ntype: string }>(
      `select r.from_id, r.predicate, r.to_id, e.type as ntype
         from relationships r join entities e on e.id = case when r.from_id = any($1::text[]) then r.to_id else r.from_id end
        where (r.from_id = any($1::text[]) or r.to_id = any($1::text[])) and e.online_only = false limit 600`,
      [anchors],
    );
    const best = new Map<string, number>();
    const perType = new Map<string, number>();
    const intents = analysis.intents;
    for (const e of edges) {
      const outbound = anchors.includes(e.from_id);
      const nid = outbound ? e.to_id : e.from_id;
      if (anchors.includes(nid)) continue;
      const w = edgeWeight(e.predicate, outbound, e.ntype, intents);
      if (w > (best.get(nid) ?? 0)) best.set(nid, w);
    }
    // Strongest neighbours first; at most a few items per type so 30 barrels cannot fill the expansion.
    const ranked = [...best.entries()].sort((a, b) => b[1] - a[1]);
    const neighbours: string[] = [];
    const itemQuestion = intents.includes("collectible_lookup") || intents.includes("100_percent_completion");
    for (const [nid, w] of ranked) {
      if (neighbours.length >= maxGraphEntities || w < 0.2) break;
      const t = nid.split(":")[0] as string;
      const cap = t === "collectible_item" ? (itemQuestion ? 4 : 1) : 5;
      if ((perType.get(t) ?? 0) >= cap) continue;
      perType.set(t, (perType.get(t) ?? 0) + 1);
      neighbours.push(nid);
    }
    if (neighbours.length) {
      const wanted = [...preferredTypes(intents, analysis.original)];
      const rows = await db.query<ChunkRow>(`${CHUNK_SELECT} where c.entity_id = any($1::text[]) and (c.position = 0 or c.content_type = any($2::text[])) and c.online_only = false`, [neighbours, wanted]);
      graphCount = rows.length;
      const pref = new Set(wanted);
      for (const r of rows) {
        const w = best.get(r.entity_id) ?? 0.3;
        // Neighbour scores stay strictly below named/inherited entities: 0.45 … 0.80.
        merge(toCandidate(r, "graph", { entityScore: Math.min(0.8, 0.45 + 0.3 * Math.min(1, w) + (pref.has(r.content_type) ? 0.05 : 0)), edgeWeight: w }));
      }
    }
  }
  const structuredMs = Date.now() - tS;

  return { candidates: [...byChunk.values()], timings: { keywordMs, vectorMs, structuredMs }, counts: { keyword: keywordCount, vector: vrows.length, entity: entityCount, graph: graphCount } };
}

/* ───────────────────────── entity tiers, graph weights, name matching ───────────────────────── */

/** Entity tiers. Named (1.0) > strong name match (0.9) > inherited from the conversation (0.85) > graph (≤ 0.8). */
export const ENTITY_SCORE = { explicit: 1, nameStrong: 0.9, inherited: 0.85, nameWeak: 0.7 } as const;

/** Base relevance of each relation for "tell me about X" questions (0..1). Hub edges are deliberately low. */
const PREDICATE_WEIGHT: Record<string, number> = {
  takes_place_at: 1, located_at: 1, starts_at: 0.95, setup_for: 0.9, part_of: 0.85, hookup_with: 0.85, requires: 0.8, unlocks: 0.8,
  next: 0.8, found_at: 0.8, rewards: 0.75, lives_at: 0.75, given_by: 0.7, located_in: 0.6, involves: 0.55, related_to: 0.55,
  family_of: 0.6, owns: 0.6, drives: 0.6, friend_of: 0.5, works_for: 0.5, sells: 0.5, enemy_of: 0.5, required_for: 0.6,
  appears_in: 0.35, contributes_to: 0.3, instance_of: 0.2, available_to: 0.12,
};

/** Predicates an intent needs most (multiplier). */
const INTENT_PREDICATE_BOOST: Partial<Record<Intent, Partial<Record<string, number>>>> = {
  location_lookup: { takes_place_at: 1.3, located_at: 1.3, starts_at: 1.3, lives_at: 1.4, located_in: 1.3, found_at: 1.3 },
  map_request: { takes_place_at: 1.3, located_at: 1.3, starts_at: 1.3, lives_at: 1.3, located_in: 1.3 },
  mission_unlock: { requires: 1.4, unlocks: 1.4, next: 1.4 },
  mission_requirements: { requires: 1.4, unlocks: 1.2 },
  heist_strategy: { setup_for: 1.3, part_of: 1.3 },
  character_information: { family_of: 1.4, hookup_with: 1.3, friend_of: 1.3, lives_at: 1.3, given_by: 1.2 },
  "100_percent_completion": { contributes_to: 3, required_for: 1.5 },
  collectible_lookup: { instance_of: 3, located_in: 1.5 },
};

/** Entity kinds that directly answer an intent. */
export const INTENT_ENTITY_TYPES: Partial<Record<Intent, EntityType[]>> = {
  troubleshooting: ["troubleshooting"], cheat: ["cheat"], random_event: ["random_event"], easter_egg: ["easter_egg"],
  "100_percent_completion": ["completion"], property: ["property", "business"], stock_market: ["stock"], version_difference: ["version"],
  vehicle_information: ["vehicle"], weapon_information: ["weapon"], activity: ["activity", "hobby"], collectible_lookup: ["collectible"],
};

export function edgeWeight(predicate: string, outbound: boolean, neighbourType: string, intents: Intent[]): number {
  let w = PREDICATE_WEIGHT[predicate] ?? 0.4;
  // Inbound "located_in" from individual items (30 barrels "in" an area) says little about the area itself.
  if (predicate === "located_in" && !outbound && neighbourType === "collectible_item") w = 0.25;
  // Membership edges are boosted only from the member's side ("does X count for 100%?" → X contributes_to 100%);
  // the hub's inbound fan-in (56 random events → 100%) stays generic.
  const membership = predicate === "contributes_to" || predicate === "required_for";
  if (!membership || outbound) for (const i of intents) w *= INTENT_PREDICATE_BOOST[i]?.[predicate] ?? 1;
  if (intents.some((i) => INTENT_ENTITY_TYPES[i]?.includes(neighbourType as EntityType))) w *= 1.6;
  return w;
}

/**
 * Entities whose NAME contains specific words of the (glossary-expanded) question. Words that belong to an already
 * named entity are excluded, so "fantasma do Mount Gordo" matches on "ghost", not on "Mount Gordo" again.
 */
export async function nameMatches(db: Db, analysis: QueryAnalysis, expanded: string, anchors: string[]): Promise<Array<{ id: string; score: number }>> {
  const named = new Set(analysis.matches.flatMap((m) => m.alias.split(" ")));
  // Short words are too ambiguous on their own, except the ones the canonical lexicon produced ("ovni" → "ufo").
  const original = new Set(normalize(analysis.original).split(" "));
  const lexicon = new Set((analysis.canonical ?? "").split(" ").filter((w) => w && !original.has(w)));
  const terms = [...new Set(topicalTerms(expanded).filter((t) => (t.length >= 4 || lexicon.has(t) || CANONICAL_TERMS.has(t)) && !named.has(t) && !NAME_STOP.has(t)))].slice(0, 8);
  if (!terms.length) return [];
  const rows = await db.query<{ id: string; type: string; words: string[]; linked: boolean }>(
    `select e.id, e.type, regexp_split_to_array(lower(regexp_replace(e.name, '[^A-Za-z0-9]+', ' ', 'g')), ' ') as words,
            exists (select 1 from relationships r where (r.from_id = e.id and r.to_id = any($2::text[])) or (r.to_id = e.id and r.from_id = any($2::text[]))) as linked
       from entities e
      where e.online_only = false and e.type not in ('collectible_item') and regexp_split_to_array(lower(regexp_replace(e.name, '[^A-Za-z0-9]+', ' ', 'g')), ' ') && $1::text[]
      limit 200`,
    [terms, anchors],
  );
  const intentTypes = new Set(analysis.intents.flatMap((i) => INTENT_ENTITY_TYPES[i] ?? []));
  return rows
    .map((r) => {
      const hits = terms.filter((t) => r.words.includes(t)).length;
      const strong = hits >= 2 || r.linked || intentTypes.has(r.type as EntityType);
      return { id: r.id, hits, score: strong ? ENTITY_SCORE.nameStrong : ENTITY_SCORE.nameWeak, strong };
    })
    // Weak matches (one shared word, no link to anything the user named) are NOT evidence: "capital" in
    // "Qual é a capital da França?" must not pull "Under Capital Blvd" into the answer.
    .filter((r) => r.strong)
    .sort((a, b) => b.hits - a.hits || b.score - a.score)
    .slice(0, 6)
    .map(({ id, score }) => ({ id, score }));
}

/** Words too common in entity names to identify anything on their own. */
const NAME_STOP = new Set(["part", "parts", "plant", "jump", "scrap", "scraps", "piece", "pieces", "waste", "package", "position", "near", "event", "random", "mission", "store", "house", "street", "drive", "avenue", "city", "county", "beach", "hills", "reference", "egg", "easter", "the"]);

/* ───────────────────────── reranking ───────────────────────── */

const PREFERRED_TYPES: Partial<Record<Intent, string[]>> = {
  mission_unlock: ["requirements"], mission_requirements: ["requirements"],
  mission_walkthrough: ["objectives", "gold", "failure", "walkthrough", "steps", "location"], mission_help: ["objectives", "gold", "failure", "location", "assassination"],
  mission_reward: ["reward", "money", "assassination"], heist_strategy: ["strategy", "approaches", "crew", "money"], money: ["money", "strategy"],
  stock_market: ["money", "strategy", "timing"], troubleshooting: ["steps", "causes", "technical"], version_difference: ["versions"], ending: ["guidance"],
  cheat: ["warning", "platforms"], "100_percent_completion": ["requirements", "weights", "misc", "exclusions", "disambiguation", "completion"],
  collectible_lookup: ["requirements", "completion", "details", "versions"], location_lookup: ["location"], activity: ["details"],
  character_information: ["overview", "details", "relationship", "missions"], random_event: ["details", "reward"],
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
  // "which one pays more / rende mais" is a comparison: guides' strategy sections answer it (often with divergences).
  [/\b(rende mais|paga mais|lucra mais|da mais dinheiro|pays? more|more profitable|earns? more|mais lucrativ\w*|best payout)\b/, ["money", "strategy"]],
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
  // Specific words of the question that are not just the entity's own name ("UFO" in "UFO on top of Mount Chiliad"):
  // the section that contains them is usually the one that answers the question.
  const terms = topicalTerms(question).filter((t) => t.length >= 3);
  const intentTypes = new Set(intents.flatMap((i) => INTENT_ENTITY_TYPES[i] ?? []));
  const quantity = /\b(how much|how many|quanto|quantos|quantas|quanta)\b/.test(normalize(question));
  for (const c of candidates) {
    // Within an entity the user named, which SECTION answers is decided by intent/hints/terms; hashed-embedding
    // similarity between sections of the same entity is mostly noise, so it counts less there.
    const sem = (maxSem > 0.15 ? c.semantic / maxSem : c.semantic) * (c.entityScore >= 1 ? 0.4 : 1);
    const typeScore = hinted.has(c.contentType) ? 1 : preferred.has(c.contentType) ? 0.8 : c.contentType === "overview" ? 0.5 : 0.25;
    c.score =
      WEIGHTS.semantic * sem + WEIGHTS.keyword * c.keyword + WEIGHTS.entity * c.entityScore + WEIGHTS.authority * (c.authority / 10) +
      WEIGHTS.contentType * typeScore + WEIGHTS.story * 1; // Online-only chunks never reach this point
    // A section of an explicitly-referenced entity that matches the intent (e.g. strategy for a heist) should dominate.
    // Only for entities the user named or is following up on (graph neighbours stay below them).
    if (c.entityScore >= 0.8 && preferred.has(c.contentType)) c.score += hinted.has(c.contentType) ? 0.35 : 0.12;
    if (c.contentType === "list") c.score += 0.4; // exhaustive structured SQL result for "all …" questions
    if (terms.length && c.entityScore >= 0.8) {
      const name = normalize(c.entityName);
      const text = normalize(c.content);
      const hits = terms.filter((t) => !name.includes(t) && text.includes(t)).length;
      c.score += 0.1 * Math.min(2, hits);
    }
    c.score *= 0.6 + 0.4 * clamp01(c.confidence);
    // Chunks of an entity the user explicitly named must not be outranked by look-alike chunks of unrelated
    // entities (hundreds of similar vehicle/item overviews share vocabulary and hashed-embedding features).
    if (c.entityScore >= 1) c.score += 0.15;
    // Vector-only hits from the local hashed embedder are noisy on a large, template-like KB (hundreds of
    // "X by Y — <class> vehicle" overviews): they need keyword, entity or graph support to compete.
    if (c.via.length === 1 && c.via[0] === "vector") c.score *= 0.75;
    // "How much / how many" questions are answered by chunks that actually state amounts.
    if (quantity && /\$\s?\d|\d\s?%|\b\d{2,}\b/.test(c.content)) c.score += 0.06;
    // Entity kinds that directly answer the intent (a troubleshooting guide for "it doesn't appear", a random event
    // for random-event questions…) get a lift over other entities that merely share words with the question.
    if (intentTypes.has(c.entityType)) c.score += 0.12;
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
  // An entity found by a STRONG name match is entity evidence as well: its name carries ≥ 2 words of the question, or it
  // is linked to an entity the user named, or it is the kind of thing the question asks about ("o OVNI" → the UFO
  // easter eggs, "o apartamento da Debra" → the Debra's-apartment secrets). Weak one-word matches never get here
  // (nameMatches drops them), so "Qual é a capital da França?" still has no evidence.
  const nameEntity = ranked.slice(0, 12).some((c) => c.entityScore >= ENTITY_SCORE.nameStrong && c.via.includes("entity"));
  if (nameEntity) return { sufficient: true, reason: "name-match", topicalTerms: terms };
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
  // With no GTA intent at all ("capital of France", "poem about cats"), every specific word must be supported —
  // one coincidental street name ("Capital Blvd") must not turn an off-topic question into an answer.
  const offDomain = analysis.intents.every((i) => i === "general_question");
  const needed = offDomain ? Math.min(terms.length, 3) : terms.length >= 3 ? 2 : 1;
  if (hits >= needed && (bestSem >= 0.1 || bestKw > 0)) return { sufficient: true, reason: "topical-term-hit", topicalTerms: terms };
  return { sufficient: false, reason: "no-evidence", topicalTerms: terms };
}
