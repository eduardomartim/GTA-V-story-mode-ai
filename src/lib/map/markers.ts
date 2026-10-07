import type { Db } from "@/lib/db/client";
import { gameToMap } from "./projection";

/**
 * Map layer data for the interactive Story Mode map. Every marker states how precise its position is:
 *  - community   : in-game coordinates measured by a community dataset (esx_collectables, GPL-3.0)
 *  - approximate : hand-placed reference point (author gazetteer / curated KB)
 *  - area        : only the named area is known; the marker sits at the area's approximate centre
 * Nothing on the map is presented as more precise than its source.
 */
export interface MapMarker {
  id: string;
  name: string;
  type: string;
  layer: string;
  x: number; // 0..1 map space
  y: number;
  gameX: number;
  gameY: number;
  gameZ?: number;
  precision: "verified" | "community" | "approximate" | "area";
  area?: string;
  region?: string;
  summary: string;
  via?: string; // for area-placed markers: the place the position comes from
}

export const LAYERS = [
  "missions", "strangers", "random-events", "characters", "safehouses", "landmarks", "areas", "properties",
  "letter-scraps", "spaceship-parts", "peyote-plants", "nuclear-waste", "submarine-pieces", "hidden-packages", "epsilon-tracts",
  "under-the-bridge", "stunt-jumps", "knife-flights", "monkey-mosaics", "vehicles", "weapons", "easter-eggs",
] as const;

const SAFEHOUSES = new Set(["location:michaels-house", "location:franklins-strawberry-house", "location:franklins-vinewood-hills-house", "location:trevors-trailer"]);

function layerOf(r: { id: string; type: string; category_id: string | null; mission_type: string | null; kind: string | null }): string {
  if (r.type === "collectible_item" && r.category_id) return r.category_id.replace(/^collectible:/, "");
  if (r.type === "mission") return r.mission_type === "stranger" ? "strangers" : "missions";
  if (r.type === "random_event") return "random-events";
  if (r.type === "character") return "characters";
  if (r.type === "location") return SAFEHOUSES.has(r.id) || r.kind === "safehouse" ? "safehouses" : r.kind === "area" ? "areas" : "landmarks";
  if (r.type === "property" || r.type === "business") return "properties";
  if (r.type === "vehicle") return "vehicles";
  if (r.type === "weapon") return "weapons";
  if (r.type === "easter_egg") return "easter-eggs";
  return "landmarks";
}

interface Row {
  id: string; name: string; type: string; summary: string; game_x: number; game_y: number; game_z: number | null; precision: MapMarker["precision"];
  area: string | null; region: string | null; category_id: string | null; mission_type: string | null; kind: string | null; via: string | null;
}

const g = globalThis as unknown as { __gtaMarkers?: Promise<MapMarker[]> };

/** Cached per process: the KB only changes on ingest (call resetMarkerCache after a re-seed in tests). */
export function getMarkers(db: Db): Promise<MapMarker[]> {
  g.__gtaMarkers ??= (async () => {
    const own = await db.query<Row>(
      `select e.id, e.name, e.type, left(e.summary, 260) as summary, g.game_x, g.game_y, g.game_z, g.precision, g.area, g.region,
              ci.category_id, m.mission_type, case when l.details->>'safehouse' = 'true' then 'safehouse' else l.details->>'kind' end as kind, null as via
         from geo_points g join entities e on e.id = g.entity_id and e.online_only = false
         left join collectible_items ci on ci.entity_id = e.id
         left join missions m on m.entity_id = e.id
         left join locations l on l.entity_id = e.id
        where g.game_x is not null and g.game_y is not null`);
    // Entities without a position of their own: placed at the related place (mission start, item area, home), precision "area".
    const derived = await db.query<Row>(
      `select distinct on (e.id) e.id, e.name, e.type, left(e.summary, 260) as summary, ag.game_x, ag.game_y, null::real as game_z, 'area' as precision,
              coalesce(ag.area, p.name) as area, ag.region, ci.category_id, m.mission_type, null as kind, p.name as via
         from entities e
         join relationships r on r.from_id = e.id and r.predicate in ('starts_at','located_in','lives_at','takes_place_at','located_at','found_at')
         join entities p on p.id = r.to_id
         join geo_points ag on ag.entity_id = r.to_id and ag.game_x is not null
         left join collectible_items ci on ci.entity_id = e.id
         left join missions m on m.entity_id = e.id
        where e.online_only = false and e.type <> 'location'
          and not exists (select 1 from geo_points gp where gp.entity_id = e.id and gp.game_x is not null)
        order by e.id, case r.predicate when 'starts_at' then 0 when 'located_in' then 1 else 2 end`);
    return [...own, ...derived].map((r) => {
      const p = gameToMap(r.game_x, r.game_y);
      return {
        id: r.id, name: r.name, type: r.type, layer: layerOf(r), x: p.x, y: p.y, gameX: r.game_x, gameY: r.game_y, gameZ: r.game_z ?? undefined,
        precision: r.precision, area: r.area ?? undefined, region: r.region ?? undefined, summary: r.summary, via: r.via ?? undefined,
      };
    });
  })().catch((err) => {
    g.__gtaMarkers = undefined;
    throw err;
  });
  return g.__gtaMarkers;
}

export function resetMarkerCache(): void {
  g.__gtaMarkers = undefined;
}
