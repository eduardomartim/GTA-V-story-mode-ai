import type { Db } from "@/lib/db/client";
import { normalize } from "@/lib/text";

export interface SearchHit {
  id: string;
  type: string;
  name: string;
  summary: string;
}
export interface SearchGroup {
  group: string;
  hits: SearchHit[];
}

const GROUPS: Array<[string, string[]]> = [
  ["Missions", ["mission", "heist", "ending"]],
  ["Characters", ["character"]],
  ["Locations", ["location"]],
  ["Vehicles", ["vehicle"]],
  ["Weapons", ["weapon"]],
  ["Collectibles", ["collectible"]],
  ["Other", ["cheat", "stock", "game_mechanic", "completion", "version", "property", "hobby", "activity", "random_event", "easter_egg", "troubleshooting"]],
];

/** Global search over aliases + names (Story Mode only): substring match on normalised aliases, ranked by trigram similarity. */
export async function searchKnowledgeBase(db: Db, q: string): Promise<SearchGroup[]> {
  const n = normalize(q);
  if (n.length < 2) return [];
  const rows = await db.query<SearchHit & { sim: number }>(
    `select e.id, e.type, e.name, e.summary, max(similarity(a.alias_norm, $1)) as sim
       from aliases a join entities e on e.id = a.entity_id
      where e.online_only = false and (a.alias_norm like $2 or similarity(a.alias_norm, $1) > 0.3)
      group by e.id, e.type, e.name, e.summary
      order by sim desc, e.name limit 60`,
    [n, `%${n.replace(/[%_\\]/g, "")}%`],
  );
  return GROUPS.map(([group, types]) => ({
    group,
    hits: rows.filter((r) => types.includes(r.type)).slice(0, 6).map(({ id, type, name, summary }) => ({ id, type, name, summary })),
  })).filter((g) => g.hits.length > 0);
}
