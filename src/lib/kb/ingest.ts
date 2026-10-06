import { createHash } from "node:crypto";
import { toVectorLiteral, type Db } from "@/lib/db/client";
import { getEmbeddingProvider, type EmbeddingProvider } from "@/lib/ai/embeddings";
import { gameToMap } from "@/lib/map/projection";
import { normalize } from "@/lib/text";
import type { Availability, EntityRecord, KnowledgeBase, KnowledgeStatus, LocationSpec } from "./schema";

export interface ChunkDraft {
  entityId: string;
  contentType: string;
  content: string;
  position: number;
  status: KnowledgeStatus;
  versions: string[];
  sourceIdx: number;
}

type Scalar = string | number | boolean;
const isScalar = (v: unknown): v is Scalar => ["string", "number", "boolean"].includes(typeof v);

/** Renders structured attributes as readable "Key: value" lines for the overview chunk. */
function attrLines(attrs: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(attrs)) {
    const key = k.replace(/_/g, " ");
    if (isScalar(v)) lines.push(`${key}: ${v}`);
    else if (Array.isArray(v) && v.length && v.every(isScalar)) lines.push(`${key}: ${v.join(", ")}`);
  }
  return lines;
}

export function buildChunks(e: EntityRecord): ChunkDraft[] {
  const scope = e.online_only ? "GTA Online ONLY (not part of Story Mode)" : "GTA V Story Mode";
  const head = [
    `${e.name} [${e.type}] — ${scope}.`,
    e.summary,
    e.aliases.length ? `Also known as: ${e.aliases.join(", ")}.` : "",
    ...attrLines(e.attrs),
    e.versions.length ? `Versions: ${e.versions.join(", ")}.` : "",
  ].filter(Boolean);
  if (e.location) {
    const { region, district, coord_precision } = e.location;
    head.push(`Location: ${[district, region].filter(Boolean).join(", ")} (map position ${coord_precision}).`);
  }
  const chunks: ChunkDraft[] = [{ entityId: e.id, contentType: "overview", content: head.join("\n"), position: 0, status: e.verification, versions: e.versions, sourceIdx: 0 }];
  e.sections.forEach((s, i) =>
    chunks.push({ entityId: e.id, contentType: s.kind, content: `${e.name} — ${s.title}: ${s.text}`, position: i + 1, status: s.status ?? e.verification, versions: s.versions ?? e.versions, sourceIdx: Math.min(s.src ?? 0, e.sources.length - 1) }),
  );
  return chunks;
}

/** Split typed attrs into dedicated columns; whatever remains is stored in the `details` jsonb. */
function take<T extends Record<string, unknown>>(attrs: Record<string, unknown>, keys: string[]): { cols: T; rest: Record<string, unknown> } {
  const cols: Record<string, unknown> = {};
  const rest: Record<string, unknown> = { ...attrs };
  for (const k of keys) {
    if (k in rest) {
      cols[k] = rest[k];
      delete rest[k];
    }
  }
  return { cols: cols as T, rest };
}

async function insertTyped(db: Db, e: EntityRecord): Promise<void> {
  const a = e.attrs;
  const json = (o: unknown) => JSON.stringify(o);
  switch (e.type) {
    case "mission": {
      const { cols, rest } = take<{ mission_type?: string; protagonists?: string[]; giver?: string; sequence?: number; missable?: boolean; counts_for_completion?: boolean }>(
        a, ["mission_type", "protagonists", "giver", "sequence", "missable", "counts_for_completion"]);
      await db.query(
        "insert into missions(entity_id,mission_type,protagonists,giver,sequence,missable,counts_for_completion,details) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",
        [e.id, cols.mission_type ?? "main", cols.protagonists ?? [], cols.giver ?? null, cols.sequence ?? null, cols.missable ?? null, cols.counts_for_completion ?? null, json(rest)],
      );
      break;
    }
    case "character": {
      const { cols, rest } = take<{ role?: string; playable?: boolean }>(a, ["role", "playable"]);
      await db.query("insert into characters(entity_id,role,playable,details) values($1,$2,$3,$4::jsonb)", [e.id, cols.role ?? null, cols.playable ?? false, json(rest)]);
      break;
    }
    case "location": {
      const l: Partial<LocationSpec> = e.location ?? {};
      const hasXY = l.game_x !== undefined && l.game_y !== undefined;
      const m = hasXY ? gameToMap(l.game_x as number, l.game_y as number) : null;
      await db.query(
        "insert into locations(entity_id,region,district,game_x,game_y,game_z,map_x,map_y,coord_precision,map_image,external_map_url,details) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)",
        [e.id, l.region ?? null, l.district ?? null, l.game_x ?? null, l.game_y ?? null, l.game_z ?? null, m?.x ?? null, m?.y ?? null,
          hasXY ? l.coord_precision : "unknown", l.map_image ?? null, l.external_map_url ?? null, json(a)],
      );
      break;
    }
    case "vehicle": {
      const { cols, rest } = take<{ category?: string; manufacturer?: string; vehicle_class?: string; story_mode_available?: boolean; availability?: Availability }>(a, ["category", "manufacturer", "vehicle_class", "story_mode_available", "availability"]);
      await db.query("insert into vehicles(entity_id,category,manufacturer,vehicle_class,story_mode_available,availability,details) values($1,$2,$3,$4,$5,$6,$7::jsonb)",
        [e.id, cols.category ?? null, cols.manufacturer ?? null, cols.vehicle_class ?? null, cols.story_mode_available ?? true, cols.availability ?? "UNKNOWN", json(rest)]);
      break;
    }
    case "weapon": {
      const { cols, rest } = take<{ category?: string; availability?: Availability }>(a, ["category", "availability"]);
      await db.query("insert into weapons(entity_id,category,availability,details) values($1,$2,$3,$4::jsonb)", [e.id, cols.category ?? null, cols.availability ?? "UNKNOWN", json(rest)]);
      break;
    }
    case "collectible": {
      const { cols, rest } = take<{ kind?: string; total?: number; counts_for_100?: boolean }>(a, ["kind", "total", "counts_for_100"]);
      await db.query("insert into collectibles(entity_id,kind,total,counts_for_100,details) values($1,$2,$3,$4,$5::jsonb)", [e.id, cols.kind ?? e.name, cols.total ?? null, cols.counts_for_100 ?? null, json(rest)]);
      break;
    }
    case "property":
      await db.query("insert into properties(entity_id,details) values($1,$2::jsonb)", [e.id, json(a)]);
      break;
    case "activity":
    case "hobby": {
      const { cols, rest } = take<{ counts_for_100?: boolean }>(a, ["counts_for_100"]);
      await db.query("insert into activities(entity_id,counts_for_100,details) values($1,$2,$3::jsonb)", [e.id, cols.counts_for_100 ?? null, json(rest)]);
      break;
    }
    case "random_event": {
      const { cols, rest } = take<{ counts_for_100?: boolean }>(a, ["counts_for_100"]);
      await db.query("insert into random_events(entity_id,counts_for_100,details) values($1,$2,$3::jsonb)", [e.id, cols.counts_for_100 ?? null, json(rest)]);
      break;
    }
    case "heist": {
      const { cols, rest } = take<{ approaches?: string[] }>(a, ["approaches"]);
      await db.query("insert into heists(entity_id,approaches,details) values($1,$2,$3::jsonb)", [e.id, cols.approaches ?? [], json(rest)]);
      break;
    }
    case "ending":
      await db.query("insert into endings(entity_id,details) values($1,$2::jsonb)", [e.id, json(a)]);
      break;
    default:
      break; // other types live only in `entities` + chunks
  }
}

export interface IngestResult {
  entities: number;
  chunks: number;
  embeddingModel: string;
  ms: number;
}

const TABLES = ["kb_meta", "chunks", "documents", "relationships", "aliases", "assets", "kb_backlog", "missions", "characters", "locations", "vehicles", "weapons", "collectibles", "properties", "activities", "random_events", "heists", "endings", "entities", "sources"];

/**
 * Full, idempotent rebuild of the knowledge base from validated JSON:
 * normalise → insert entities/typed rows/aliases/relations → chunk → embed (batched, offline) → insert.
 * Embeddings are computed here, once, never at request time.
 */
export async function ingestKnowledgeBase(db: Db, kb: KnowledgeBase, provider: EmbeddingProvider = getEmbeddingProvider()): Promise<IngestResult> {
  const t0 = Date.now();
  const drafts = kb.entities.flatMap(buildChunks);
  const vectors = await provider.embed(drafts.map((d) => d.content));
  const sourceById = new Map(kb.sources.map((s) => [s.id, s]));
  const byId = new Map(kb.entities.map((e) => [e.id, e]));

  await db.transaction(async (tx) => {
    await tx.exec(`truncate table ${TABLES.join(", ")} restart identity cascade`);

    for (const s of kb.sources) {
      await tx.query("insert into sources(id,name,base_url,source_type,authority,notes) values($1,$2,$3,$4,$5,$6)", [s.id, s.name, s.base_url, s.source_type, s.authority, s.notes ?? null]);
    }

    for (const e of kb.entities) {
      const data = { sources: e.sources, aliases: e.aliases };
      await tx.query(
        "insert into entities(id,type,name,summary,story_mode,online_only,spoiler_level,versions,verification,confidence,data) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)",
        [e.id, e.type, e.name, e.summary, e.story_mode, e.online_only, e.spoiler_level, e.versions, e.verification, e.confidence, JSON.stringify(data)],
      );
      await insertTyped(tx, e);
      const seen = new Set<string>();
      const withoutThe = /^the /i.test(e.name) ? [e.name.slice(4)] : [];
      // "Duster (crop duster)" is also reachable as "Duster" and as "crop duster".
      const paren = e.name.match(/^(.*?)\s*\((.*?)\)\s*$/);
      if (paren) withoutThe.push(paren[1] as string, paren[2] as string);
      for (const alias of [e.name, ...e.aliases, ...withoutThe]) {
        const norm = normalize(alias);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        await tx.query("insert into aliases(entity_id,alias,alias_norm) values($1,$2,$3)", [e.id, alias, norm]);
      }
    }

    for (const e of kb.entities) {
      const primary = e.sources[0];
      if (!primary) continue;
      for (const r of e.relations) {
        await tx.query("insert into relationships(from_id,predicate,to_id,source_id) values($1,$2,$3,$4) on conflict do nothing", [e.id, r.predicate, r.to, primary.source]);
      }
    }

    const docIds = new Map<string, number>();
    for (const e of kb.entities) {
      const primary = e.sources[0];
      if (!primary || !sourceById.has(primary.source)) continue;
      const hash = createHash("sha256").update(JSON.stringify(e)).digest("hex").slice(0, 16);
      const rows = await tx.query<{ id: string | number }>(
        "insert into documents(entity_id,title,source_id,source_url,source_date,retrieved_at,confidence,content_hash) values($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [e.id, e.name, primary.source, primary.url, primary.source_date ?? null, primary.retrieved_at ?? null, primary.confidence, hash],
      );
      docIds.set(e.id, Number(rows[0]?.id));
    }

    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const vec = vectors[i];
      const e = d ? byId.get(d.entityId) : undefined;
      const primary = e?.sources[d?.sourceIdx ?? 0] ?? e?.sources[0];
      if (!d || !vec || !e || !primary) continue;
      await tx.query(
        `insert into chunks(document_id,entity_id,entity_type,content_type,content,search_text,embedding,embedding_model,embedding_provider,embedding_dimension,source_id,source_url,confidence,story_mode,online_only,spoiler_level,versions,position,knowledge_status)
         values($1,$2,$3,$4,$5,$6,$7::vector,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [docIds.get(e.id), e.id, e.type, d.contentType, d.content, normalize(`${d.content} ${e.aliases.join(" ")}`), toVectorLiteral(vec), provider.id, provider.provider, provider.dimension,
          primary.source, primary.url, primary.confidence, e.story_mode, e.online_only, e.spoiler_level, d.versions, d.position, d.status],
      );
    }

    for (const a of kb.assets) {
      await tx.query(
        "insert into assets(id,title,asset_type,url,thumbnail_url,source,source_url,entity_type,entity_id,license,attribution) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        [a.id, a.title, a.asset_type, a.url, a.thumbnail_url ?? null, a.source, a.source_url ?? null, a.entity_type ?? null, a.entity_id ?? null, a.license, a.attribution ?? null],
      );
    }
    for (const [key, value] of Object.entries({ embedding_provider: provider.provider, embedding_model: provider.id, embedding_dimension: String(provider.dimension), ingested_at: new Date().toISOString() })) {
      await tx.query("insert into kb_meta(key,value) values($1,$2) on conflict (key) do update set value = excluded.value, updated_at = now()", [key, value]);
    }
    for (const b of kb.backlog) {
      await tx.query("insert into kb_backlog(topic,entity_id,note) values($1,$2,$3)", [b.topic, b.entity_id ?? null, b.note]);
    }
  });

  return { entities: kb.entities.length, chunks: drafts.length, embeddingModel: provider.id, ms: Date.now() - t0 };
}
