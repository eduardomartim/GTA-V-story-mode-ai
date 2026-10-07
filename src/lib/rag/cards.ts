import type { Db } from "@/lib/db/client";
import type { EntityType } from "@/lib/kb/schema";
import type { CardData, EntityRef, Intent } from "./types";

interface EntityRow {
  id: string;
  type: EntityType;
  name: string;
  summary: string;
  story_mode: boolean;
  spoiler_level: number;
  versions: string[];
  data: Record<string, unknown>;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

async function entityRow(db: Db, id: string): Promise<EntityRow | undefined> {
  const rows = await db.query<EntityRow>("select id, type, name, summary, story_mode, spoiler_level, versions, data from entities where id = $1 and online_only = false", [id]);
  return rows[0];
}

/** Resolves the location entity related to a mission/heist/collectible via takes_place_at / located_at / found_at. */
async function relatedLocation(db: Db, entityId: string): Promise<string | undefined> {
  const rows = await db.query<{ to_id: string }>(
    `select to_id from relationships where from_id = $1 and predicate in ('takes_place_at','located_at','found_at','located_in') and to_id like 'location:%' limit 1`, [entityId]);
  return rows[0]?.to_id;
}

export async function locationCard(db: Db, id: string): Promise<(CardData & { kind: "location" }) | undefined> {
  const e = await entityRow(db, id);
  if (!e || e.type !== "location") return undefined;
  const rows = await db.query<{ region: string | null; district: string | null; map_x: number | null; map_y: number | null; game_x: number | null; game_y: number | null; coord_precision: string; external_map_url: string | null }>(
    "select region, district, map_x, map_y, game_x, game_y, coord_precision, external_map_url from locations where entity_id = $1", [id]);
  const l = rows[0];
  return {
    kind: "location", entityId: id, name: e.name, region: l?.region ?? undefined, district: l?.district ?? undefined,
    mapX: l?.map_x ?? undefined, mapY: l?.map_y ?? undefined, gameX: l?.game_x ?? undefined, gameY: l?.game_y ?? undefined, precision: l?.coord_precision ?? "unknown",
    externalMapUrl: l?.external_map_url ?? undefined, summary: e.summary,
  };
}

export async function mapCard(db: Db, id: string, extraIds: string[] = []): Promise<(CardData & { kind: "map" }) | undefined> {
  const main = await locationCard(db, id);
  if (!main || main.mapX === undefined || main.mapY === undefined) return undefined;
  const markers = [{ id, name: main.name, mapX: main.mapX, mapY: main.mapY }];
  for (const x of extraIds.filter((i) => i !== id).slice(0, 4)) {
    const c = await locationCard(db, x);
    if (c?.mapX !== undefined && c.mapY !== undefined) markers.push({ id: x, name: c.name, mapX: c.mapX, mapY: c.mapY });
  }
  return { kind: "map", entityId: id, name: main.name, mapX: main.mapX, mapY: main.mapY, gameX: main.gameX, gameY: main.gameY, precision: main.precision, externalMapUrl: main.externalMapUrl, markers };
}

export async function entityCard(db: Db, ref: EntityRef): Promise<CardData | undefined> {
  const e = await entityRow(db, ref.id);
  if (!e) return undefined;
  switch (e.type) {
    case "mission": {
      const m = (await db.query<{ mission_type: string; protagonists: string[]; giver: string | null; sequence: number | null }>(
        "select mission_type, protagonists, giver, sequence from missions where entity_id = $1", [e.id]))[0];
      const heistRel = (await db.query<{ to_id: string }>("select to_id from relationships where from_id = $1 and predicate in ('part_of','setup_for') limit 1", [e.id]))[0];
      const locId = (await relatedLocation(db, e.id)) ?? (heistRel ? await relatedLocation(db, heistRel.to_id) : undefined);
      const loc = locId ? await entityRow(db, locId) : undefined;
      return {
        kind: "mission", entityId: e.id, name: e.name, missionType: m?.mission_type ?? "main", protagonists: m?.protagonists ?? [],
        giver: m?.giver ?? undefined, sequence: m?.sequence ?? undefined, summary: e.summary, spoilerLevel: e.spoiler_level,
        location: loc ? { entityId: loc.id, name: loc.name } : undefined,
      };
    }
    case "heist": {
      const h = (await db.query<{ approaches: string[] }>("select approaches from heists where entity_id = $1", [e.id]))[0];
      const locId = await relatedLocation(db, e.id);
      const loc = locId ? await entityRow(db, locId) : undefined;
      return {
        kind: "mission", entityId: e.id, name: e.name, missionType: "heist", protagonists: [], summary: e.summary, approaches: h?.approaches ?? [],
        spoilerLevel: e.spoiler_level, location: loc ? { entityId: loc.id, name: loc.name } : undefined,
      };
    }
    case "character": {
      const c = (await db.query<{ role: string | null; playable: boolean; details: Record<string, unknown> }>("select role, playable, details from characters where entity_id = $1", [e.id]))[0];
      return { kind: "character", entityId: e.id, name: e.name, role: c?.role ?? undefined, playable: c?.playable ?? false, summary: e.summary, ability: str(c?.details?.special_ability) };
    }
    case "vehicle": {
      const v = (await db.query<{ category: string | null; manufacturer: string | null; story_mode_available: boolean; details: Record<string, unknown> }>("select category, manufacturer, story_mode_available, details from vehicles where entity_id = $1", [e.id]))[0];
      return { kind: "vehicle", entityId: e.id, name: e.name, category: v?.category ?? undefined, manufacturer: v?.manufacturer ?? undefined, summary: e.summary, howToGet: str(v?.details?.how_to_get) ?? (str(v?.details?.cheat_pc) ? `PC cheat: ${str(v?.details?.cheat_pc)}` : undefined), storyMode: v?.story_mode_available ?? true };
    }
    case "weapon": {
      const w = (await db.query<{ category: string | null }>("select category from weapons where entity_id = $1", [e.id]))[0];
      return { kind: "weapon", entityId: e.id, name: e.name, category: w?.category ?? undefined, summary: e.summary };
    }
    case "collectible": {
      const c = (await db.query<{ total: number | null; details: Record<string, unknown> }>("select total, details from collectibles where entity_id = $1", [e.id]))[0];
      return { kind: "collectible", entityId: e.id, name: e.name, total: c?.total ?? undefined, summary: e.summary, reward: str(c?.details?.reward), versions: e.versions };
    }
    case "location":
      return locationCard(db, e.id);
    default:
      return undefined;
  }
}

const CARD_ENTITY_TYPES = new Set<EntityType>(["mission", "heist", "character", "vehicle", "weapon", "collectible", "location"]);
const TYPE_PRIORITY: Partial<Record<EntityType, number>> = { heist: 0, mission: 1, location: 2, collectible: 3, vehicle: 4, weapon: 5, character: 6 };

export interface CardPlan {
  cards: CardData[];
  focus: string[];
}

/**
 * Chooses which rich cards accompany an answer. Cards are built from structured rows (never from LLM
 * output), so what they display is always grounded in the database. At most 3 cards are returned.
 */
export async function planCards(db: Db, refs: EntityRef[], intents: Intent[], limit = 3): Promise<CardPlan> {
  const wantsMap = intents.includes("map_request");
  const wantsLoc = intents.includes("location_lookup") || wantsMap;
  const wantsImage = intents.includes("image_request");
  const candidates = refs.filter((r) => CARD_ENTITY_TYPES.has(r.type) && !r.onlineOnly)
    .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9));
  const cards: CardData[] = [];
  const focus: string[] = [];
  const seen = new Set<string>();

  for (const ref of candidates) {
    if (cards.length >= limit) break;
    if (seen.has(ref.id)) continue;
    seen.add(ref.id);
    focus.push(ref.id);

    // Location questions about a non-location entity resolve to its related location.
    let locId: string | undefined = ref.type === "location" ? ref.id : undefined;
    if (!locId && wantsLoc) locId = await relatedLocation(db, ref.id);

    const base = await entityCard(db, ref);
    if (wantsLoc && locId) {
      const lc = await locationCard(db, locId);
      const mc = lc?.mapX !== undefined ? await mapCard(db, locId) : undefined;
      if (base && ref.type !== "location") cards.push(base);
      if (lc) cards.push(lc);
      if (mc && cards.length < limit + 1) cards.push(mc);
    } else if (base) {
      cards.push(base);
    }

    if (wantsImage) {
      const imgs = await db.query<{ id: string; title: string; url: string; license: string; attribution: string | null; source: string; source_url: string | null }>(
        "select id, title, url, license, attribution, source, source_url from assets where entity_id = $1 limit 1", [ref.id]);
      const img = imgs[0];
      if (img) cards.push({ kind: "image", entityId: ref.id, title: img.title, url: img.url, isExternalLink: img.url.startsWith("http"), license: img.license, attribution: img.attribution ?? undefined, source: img.source, sourceUrl: img.source_url ?? undefined });
    }
  }
  const out = cards.slice(0, limit + 1);
  const related = focus[0] ? await relatedCard(db, focus[0]) : undefined;
  if (related) out.push(related);
  return { cards: out, focus };
}

/**
 * "Related missions / characters / places" for the focused entity, straight from the knowledge graph
 * (both edge directions, hub edges excluded). Clicking an item asks the agent about it.
 */
export async function relatedCard(db: Db, id: string): Promise<CardData | undefined> {
  const rows = await db.query<{ id: string; name: string; type: string }>(
    `select distinct on (e.id) e.id, e.name, e.type from (
       select to_id as nid, predicate from relationships where from_id = $1
       union all select from_id as nid, predicate from relationships where to_id = $1
     ) r join entities e on e.id = r.nid
     where e.online_only = false and e.type in ('mission','heist','character','location','random_event','activity','hobby','easter_egg','vehicle','collectible')
       and r.predicate not in ('instance_of','contributes_to') and e.id <> $1
     order by e.id limit 40`, [id]);
  if (rows.length < 2) return undefined;
  const order: Record<string, number> = { mission: 0, heist: 0, character: 1, location: 2, random_event: 3, activity: 3, hobby: 3, easter_egg: 4, vehicle: 5, collectible: 6 };
  const items = rows.sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9) || a.name.localeCompare(b.name)).slice(0, 12);
  return { kind: "related", title: "related", items };
}
