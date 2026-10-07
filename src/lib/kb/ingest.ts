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

const PRECISION_TEXT: Record<string, string> = {
  verified: "verified coordinates",
  community: "community-measured in-game coordinates",
  approximate: "approximate map position",
  area: "area only, no coordinates",
  unknown: "no coordinates",
};

export function buildChunks(e: EntityRecord): ChunkDraft[] {
  const scope = e.online_only ? "GTA Online ONLY (not part of Story Mode)" : "GTA V Story Mode";
  const head = [
    `${e.name} [${e.type === "collectible_item" ? (e.item?.kind ?? "collectible item") : e.type}] — ${scope}.`,
    e.summary,
    e.aliases.length ? `Also known as: ${e.aliases.join(", ")}.` : "",
    ...attrLines(e.attrs),
    e.versions.length ? `Versions: ${e.versions.join(", ")}.` : "",
  ].filter(Boolean);
  if (e.item) {
    const it = e.item;
    head.push(
      [
        it.number ? `${it.kind} #${it.number} (numbering of the source list)` : it.kind,
        it.area ? `area: ${it.area}` : "",
        it.region ? `region: ${it.region}` : "",
        it.protagonists.length ? `can be collected by: ${it.protagonists.join(", ")}` : "",
        it.counts_for_100 === undefined ? "" : `counts for 100%: ${it.counts_for_100 ? "yes" : "no"}`,
      ].filter(Boolean).join("; ") + ".",
    );
  }
  if (e.location) {
    const { region, district, area, coord_precision, game_x, game_y, game_z } = e.location;
    const where = [area ?? district, region].filter(Boolean).join(", ");
    const coords = game_x !== undefined && game_y !== undefined ? ` Coordinates x ${game_x.toFixed(1)}, y ${game_y.toFixed(1)}${game_z !== undefined ? `, z ${game_z.toFixed(1)}` : ""}.` : "";
    head.push(`Location: ${where || "San Andreas"} (${PRECISION_TEXT[coord_precision] ?? coord_precision}).${coords}`);
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

/**
 * Multi-row INSERT in slices (keeps the parameter count far below Postgres' 65 535 limit). `casts` lets a column be
 * written as e.g. `$7::vector` or `$3::jsonb`. This is what makes a few thousand entities ingest in seconds.
 */
async function insertMany(db: Db, table: string, columns: string[], rows: unknown[][], casts: Record<string, string> = {}, suffix = ""): Promise<void> {
  if (!rows.length) return;
  const per = Math.max(1, Math.floor(20_000 / columns.length));
  for (let i = 0; i < rows.length; i += per) {
    const slice = rows.slice(i, i + per);
    const params: unknown[] = [];
    const values = slice.map((r) => `(${columns.map((c, j) => {
      params.push(r[j] ?? null);
      return `$${params.length}${casts[c] ? `::${casts[c]}` : ""}`;
    }).join(",")})`);
    await db.query(`insert into ${table}(${columns.join(",")}) values ${values.join(",")} ${suffix}`, params);
  }
}

const json = (o: unknown) => JSON.stringify(o);
/** Typed boolean columns accept only real booleans; anything else is stored as null (the raw value stays in `details`). */
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

type TypedRows = Record<string, { columns: string[]; rows: unknown[][]; casts?: Record<string, string> }>;

function typedRows(entities: EntityRecord[]): TypedRows {
  const t: TypedRows = {
    missions: { columns: ["entity_id", "mission_type", "protagonists", "giver", "sequence", "missable", "counts_for_completion", "details"], rows: [], casts: { details: "jsonb" } },
    characters: { columns: ["entity_id", "role", "playable", "details"], rows: [], casts: { details: "jsonb" } },
    locations: { columns: ["entity_id", "region", "district", "game_x", "game_y", "game_z", "map_x", "map_y", "coord_precision", "map_image", "external_map_url", "details"], rows: [], casts: { details: "jsonb" } },
    vehicles: { columns: ["entity_id", "category", "manufacturer", "vehicle_class", "story_mode_available", "availability", "details"], rows: [], casts: { details: "jsonb" } },
    weapons: { columns: ["entity_id", "category", "availability", "details"], rows: [], casts: { details: "jsonb" } },
    collectibles: { columns: ["entity_id", "kind", "total", "counts_for_100", "details"], rows: [], casts: { details: "jsonb" } },
    collectible_items: { columns: ["entity_id", "category_id", "kind", "number", "area", "region", "counts_for_100", "protagonists", "details"], rows: [], casts: { details: "jsonb" } },
    properties: { columns: ["entity_id", "details"], rows: [], casts: { details: "jsonb" } },
    activities: { columns: ["entity_id", "counts_for_100", "details"], rows: [], casts: { details: "jsonb" } },
    random_events: { columns: ["entity_id", "counts_for_100", "details"], rows: [], casts: { details: "jsonb" } },
    heists: { columns: ["entity_id", "approaches", "details"], rows: [], casts: { details: "jsonb" } },
    endings: { columns: ["entity_id", "details"], rows: [], casts: { details: "jsonb" } },
  };
  const push = (table: string, row: unknown[]) => t[table]?.rows.push(row);
  for (const e of entities) {
    const a = e.attrs;
    switch (e.type) {
      case "mission": {
        const { cols, rest } = take<{ mission_type?: string; protagonists?: string[]; giver?: string; sequence?: number; missable?: boolean; counts_for_completion?: boolean }>(
          a, ["mission_type", "protagonists", "giver", "sequence", "missable", "counts_for_completion"]);
        push("missions", [e.id, cols.mission_type ?? "main", cols.protagonists ?? [], cols.giver ?? null, cols.sequence ?? null, bool(cols.missable), bool(cols.counts_for_completion), json(rest)]);
        break;
      }
      case "character": {
        const { cols, rest } = take<{ role?: string; playable?: boolean }>(a, ["role", "playable"]);
        push("characters", [e.id, cols.role ?? null, cols.playable ?? false, json(rest)]);
        break;
      }
      case "location": {
        const l: Partial<LocationSpec> = e.location ?? {};
        const hasXY = l.game_x !== undefined && l.game_y !== undefined;
        const m = hasXY ? gameToMap(l.game_x as number, l.game_y as number) : null;
        push("locations", [e.id, l.region ?? null, l.district ?? l.area ?? null, l.game_x ?? null, l.game_y ?? null, l.game_z ?? null, m?.x ?? null, m?.y ?? null,
          hasXY ? l.coord_precision : "unknown", l.map_image ?? null, l.external_map_url ?? null, json(a)]);
        break;
      }
      case "vehicle": {
        const { cols, rest } = take<{ category?: string; manufacturer?: string; vehicle_class?: string; story_mode_available?: boolean; availability?: Availability }>(a, ["category", "manufacturer", "vehicle_class", "story_mode_available", "availability"]);
        push("vehicles", [e.id, cols.category ?? null, cols.manufacturer ?? null, cols.vehicle_class ?? null, cols.story_mode_available ?? true, cols.availability ?? "UNKNOWN", json(rest)]);
        break;
      }
      case "weapon": {
        const { cols, rest } = take<{ category?: string; availability?: Availability }>(a, ["category", "availability"]);
        push("weapons", [e.id, cols.category ?? null, cols.availability ?? "UNKNOWN", json(rest)]);
        break;
      }
      case "collectible": {
        const { cols, rest } = take<{ kind?: string; total?: number; counts_for_100?: boolean }>(a, ["kind", "total", "counts_for_100"]);
        push("collectibles", [e.id, cols.kind ?? e.name, typeof cols.total === "number" ? cols.total : null, bool(cols.counts_for_100), json(rest)]);
        break;
      }
      case "collectible_item": {
        const it = e.item;
        if (it) push("collectible_items", [e.id, it.category, it.kind, it.number ?? null, it.area ?? e.location?.area ?? null, it.region ?? e.location?.region ?? null, it.counts_for_100 ?? null, it.protagonists, json(a)]);
        break;
      }
      case "property":
      case "business":
        push("properties", [e.id, json(a)]);
        break;
      case "activity":
      case "hobby": {
        const { cols, rest } = take<{ counts_for_100?: boolean }>(a, ["counts_for_100"]);
        push("activities", [e.id, bool(cols.counts_for_100), json(typeof cols.counts_for_100 === "boolean" ? rest : { ...rest, counts_for_100_note: cols.counts_for_100 })]);
        break;
      }
      case "random_event": {
        const { cols, rest } = take<{ counts_for_100?: boolean }>(a, ["counts_for_100"]);
        push("random_events", [e.id, bool(cols.counts_for_100), json(rest)]);
        break;
      }
      case "heist": {
        const { cols, rest } = take<{ approaches?: string[] }>(a, ["approaches"]);
        push("heists", [e.id, cols.approaches ?? [], json(rest)]);
        break;
      }
      case "ending":
        push("endings", [e.id, json(a)]);
        break;
      default:
        break; // other types live only in `entities` + chunks
    }
  }
  return t;
}

export interface IngestResult {
  entities: number;
  chunks: number;
  embeddingModel: string;
  ms: number;
}

const TABLES = ["kb_meta", "evidence", "completion_requirements", "geo_points", "collectible_items", "chunks", "documents", "relationships", "aliases", "assets", "kb_backlog", "missions", "characters", "locations", "vehicles", "weapons", "collectibles", "properties", "activities", "random_events", "heists", "endings", "entities", "sources"];

/** Every name an entity can be reached by: its name, explicit aliases, "the"-less and parenthesis variants. */
export function aliasesOf(e: EntityRecord): string[] {
  const extra = /^the /i.test(e.name) ? [e.name.slice(4)] : [];
  // "Duster (crop duster)" is also reachable as "Duster" and as "crop duster".
  const paren = e.name.match(/^(.*?)\s*\((.*?)\)\s*$/);
  // Only for vehicles/weapons, where the parenthesis is a synonym; for places it is a qualifier ("Bank (Paleto Bay)").
  if (paren && (e.type === "vehicle" || e.type === "weapon")) extra.push(paren[1] as string, paren[2] as string);
  return [e.name, ...e.aliases, ...extra];
}

/**
 * Full, idempotent rebuild of the knowledge base from validated JSON:
 * normalise → insert entities/typed rows/aliases/relations/geo/items/completion/evidence → chunk → embed (batched,
 * offline) → insert. Embeddings are computed here, once, never at request time.
 */
export async function ingestKnowledgeBase(db: Db, kb: KnowledgeBase, provider: EmbeddingProvider = getEmbeddingProvider()): Promise<IngestResult> {
  const t0 = Date.now();
  const drafts = kb.entities.flatMap(buildChunks);
  const vectors = await provider.embed(drafts.map((d) => d.content));
  const sourceById = new Map(kb.sources.map((s) => [s.id, s]));
  const byId = new Map(kb.entities.map((e) => [e.id, e]));

  await db.transaction(async (tx) => {
    await tx.exec(`truncate table ${TABLES.join(", ")} restart identity cascade`);

    await insertMany(tx, "sources", ["id", "name", "base_url", "source_type", "authority", "notes", "license"],
      kb.sources.map((s) => [s.id, s.name, s.base_url, s.source_type, s.authority, s.notes ?? null, s.license ?? null]));

    await insertMany(tx, "entities", ["id", "type", "name", "summary", "story_mode", "online_only", "spoiler_level", "versions", "verification", "confidence", "data"],
      kb.entities.map((e) => [e.id, e.type, e.name, e.summary, e.story_mode, e.online_only, e.spoiler_level, e.versions, e.verification, e.confidence, json({ sources: e.sources, aliases: e.aliases })]),
      { data: "jsonb" });

    for (const [table, spec] of Object.entries(typedRows(kb.entities))) await insertMany(tx, table, spec.columns, spec.rows, spec.casts);

    const aliasRows: unknown[][] = [];
    for (const e of kb.entities) {
      const seen = new Set<string>();
      for (const alias of aliasesOf(e)) {
        const norm = normalize(alias);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        aliasRows.push([e.id, alias, norm]);
      }
    }
    await insertMany(tx, "aliases", ["entity_id", "alias", "alias_norm"], aliasRows);

    const relRows: unknown[][] = [];
    const relSeen = new Set<string>();
    for (const e of kb.entities) {
      const primary = e.sources[0];
      if (!primary) continue;
      for (const r of e.relations) {
        const key = `${e.id}|${r.predicate}|${r.to}`;
        if (relSeen.has(key)) continue;
        relSeen.add(key);
        relRows.push([e.id, r.predicate, r.to, primary.source, json(r.props ?? {}), r.status ?? (e.verification === "verified" ? "curated" : e.verification)]);
      }
    }
    await insertMany(tx, "relationships", ["from_id", "predicate", "to_id", "source_id", "props", "knowledge_status"], relRows, { props: "jsonb" }, "on conflict do nothing");

    // Geo points for every entity with a position (items, homes, spawns…), not only `location` entities.
    const geoRows: unknown[][] = [];
    for (const e of kb.entities) {
      const l = e.location;
      if (!l) continue;
      const hasXY = l.game_x !== undefined && l.game_y !== undefined;
      if (!hasXY && !l.area && !l.district) continue;
      const m = hasXY ? gameToMap(l.game_x as number, l.game_y as number) : null;
      const precision = !hasXY ? "area" : l.coord_precision === "unknown" || l.coord_precision === "area" ? "approximate" : l.coord_precision;
      geoRows.push([e.id, l.game_x ?? null, l.game_y ?? null, l.game_z ?? null, m?.x ?? null, m?.y ?? null, precision, l.area ?? l.district ?? null, l.region ?? null, l.coord_source ?? null]);
    }
    await insertMany(tx, "geo_points", ["entity_id", "game_x", "game_y", "game_z", "map_x", "map_y", "precision", "area", "region", "coord_source"], geoRows);

    // Documents (one per entity, primary source) and evidence (one row per source reference).
    const docIds = new Map<string, number>();
    const docEntities = kb.entities.filter((e) => e.sources[0] && sourceById.has((e.sources[0] as { source: string }).source));
    for (let i = 0; i < docEntities.length; i += 500) {
      const slice = docEntities.slice(i, i + 500);
      const params: unknown[] = [];
      const values = slice.map((e) => {
        const p = e.sources[0] as EntityRecord["sources"][number];
        const hash = createHash("sha256").update(JSON.stringify(e)).digest("hex").slice(0, 16);
        params.push(e.id, e.name, p.source, p.url, p.source_date ?? null, p.retrieved_at ?? null, p.confidence, hash, p.title ?? null);
        const n = params.length;
        return `($${n - 8},$${n - 7},$${n - 6},$${n - 5},$${n - 4},$${n - 3},$${n - 2},$${n - 1},$${n})`;
      });
      const rows = await tx.query<{ id: string | number; entity_id: string }>(
        `insert into documents(entity_id,title,source_id,source_url,source_date,retrieved_at,confidence,content_hash,source_title) values ${values.join(",")} returning id, entity_id`, params);
      for (const r of rows) docIds.set(r.entity_id, Number(r.id));
    }

    const evRows: unknown[][] = [];
    for (const e of kb.entities) {
      e.sources.forEach((s, idx) => {
        if (!sourceById.has(s.source)) return;
        const sections = e.sections.filter((sec) => (sec.src ?? 0) === idx).map((sec) => sec.kind);
        const status = idx === 0 ? e.verification : (e.sections.find((sec) => (sec.src ?? 0) === idx)?.status ?? e.verification);
        evRows.push([e.id, idx === 0 ? "overview" : (sections[0] ?? "supporting"), s.source, s.url, s.title ?? null, s.retrieved_at ?? null, sourceById.get(s.source)?.license ?? null, s.excerpt ?? null, status, s.confidence]);
      });
    }
    await insertMany(tx, "evidence", ["entity_id", "section", "source_id", "url", "title", "retrieved_at", "license", "excerpt", "knowledge_status", "confidence"], evRows);

    const chunkRows: unknown[][] = [];
    drafts.forEach((d, i) => {
      const vec = vectors[i];
      const e = byId.get(d.entityId);
      const src = e?.sources[d.sourceIdx] ?? e?.sources[0];
      if (!vec || !e || !src || !docIds.has(e.id)) return;
      chunkRows.push([docIds.get(e.id), e.id, e.type, d.contentType, d.content, normalize(`${d.content} ${e.aliases.join(" ")}`), toVectorLiteral(vec), provider.id, provider.provider, provider.dimension,
        src.source, src.url, src.confidence, e.story_mode, e.online_only, e.spoiler_level, d.versions, d.position, d.status, src.title ?? null]);
    });
    await insertMany(tx, "chunks", ["document_id", "entity_id", "entity_type", "content_type", "content", "search_text", "embedding", "embedding_model", "embedding_provider", "embedding_dimension",
      "source_id", "source_url", "confidence", "story_mode", "online_only", "spoiler_level", "versions", "position", "knowledge_status", "source_title"], chunkRows, { embedding: "vector" });

    await insertMany(tx, "assets", ["id", "title", "asset_type", "url", "thumbnail_url", "source", "source_url", "entity_type", "entity_id", "license", "attribution"],
      kb.assets.map((a) => [a.id, a.title, a.asset_type, a.url, a.thumbnail_url ?? null, a.source, a.source_url ?? null, a.entity_type ?? null, a.entity_id ?? null, a.license, a.attribution ?? null]));

    await insertMany(tx, "completion_requirements", ["id", "category", "label", "required_count", "total_count", "protagonists", "target_ids", "source_id", "source_url", "knowledge_status", "notes", "position"],
      kb.completion.map((c, i) => [c.id, c.category, c.label, c.required_count ?? null, c.total_count ?? null, c.protagonists, c.target_ids, c.source, c.url, c.status, c.notes ?? null, i]));

    for (const [key, value] of Object.entries({ embedding_provider: provider.provider, embedding_model: provider.id, embedding_dimension: String(provider.dimension), ingested_at: new Date().toISOString() })) {
      await tx.query("insert into kb_meta(key,value) values($1,$2) on conflict (key) do update set value = excluded.value, updated_at = now()", [key, value]);
    }
    await insertMany(tx, "kb_backlog", ["topic", "entity_id", "note"], kb.backlog.map((b) => [b.topic, b.entity_id ?? null, b.note]));
  });

  return { entities: kb.entities.length, chunks: drafts.length, embeddingModel: provider.id, ms: Date.now() - t0 };
}
