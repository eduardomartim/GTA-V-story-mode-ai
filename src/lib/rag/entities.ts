import { getDb } from "@/lib/db/client";
import type { EntityType } from "@/lib/kb/schema";
import { normalize } from "@/lib/text";
import type { EntityMatch, EntityRef } from "./types";

interface AliasIndex {
  byAlias: Map<string, EntityRef[]>;
  byId: Map<string, EntityRef>;
  maxTokens: number;
}

const g = globalThis as unknown as { __gtaAliasIndex?: Promise<AliasIndex> };

/** Loads the alias table once (it is tiny) and keeps it in memory; the KB only changes on ingest. */
export function getAliasIndex(): Promise<AliasIndex> {
  if (!g.__gtaAliasIndex) {
    g.__gtaAliasIndex = (async () => {
      const db = await getDb();
      const rows = await db.query<{ alias_norm: string; id: string; type: EntityType; name: string; online_only: boolean; spoiler_level: number }>(
        "select a.alias_norm, e.id, e.type, e.name, e.online_only, e.spoiler_level from aliases a join entities e on e.id = a.entity_id",
      );
      const byAlias = new Map<string, EntityRef[]>();
      const byId = new Map<string, EntityRef>();
      let maxTokens = 1;
      for (const r of rows) {
        const ref: EntityRef = { id: r.id, type: r.type, name: r.name, onlineOnly: r.online_only, spoilerLevel: r.spoiler_level };
        byId.set(r.id, ref);
        const list = byAlias.get(r.alias_norm) ?? [];
        list.push(ref);
        byAlias.set(r.alias_norm, list);
        maxTokens = Math.max(maxTokens, r.alias_norm.split(" ").length);
      }
      return { byAlias, byId, maxTokens };
    })().catch((err) => {
      g.__gtaAliasIndex = undefined;
      throw err;
    });
  }
  return g.__gtaAliasIndex;
}

export function resetAliasIndex(): void {
  g.__gtaAliasIndex = undefined;
}

export async function getEntityRef(id: string): Promise<EntityRef | undefined> {
  return (await getAliasIndex()).byId.get(id);
}

/** Single-token aliases that are far too common in questions to count as an entity mention on their own. */
const AMBIGUOUS_SINGLE = new Set(["port", "arena", "agency", "original", "money", "crew", "versions", "cheats", "properties", "map", "versoes", "casas", "atividades", "hobbies", "codigos", "dinheiro", "doomsday"]);

/**
 * Longest-match-first alias lookup over the normalised query. "jewel store job" beats "jewel store",
 * which beats any single word. All entities sharing an alias are returned (e.g. mission + heist).
 */
export async function extractEntities(query: string): Promise<{ matches: EntityMatch[]; entities: EntityRef[] }> {
  const index = await getAliasIndex();
  const tokens = normalize(query).split(" ").filter(Boolean);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const matches: EntityMatch[] = [];

  const lookup = (phrase: string): EntityRef[] | undefined => {
    const direct = index.byAlias.get(phrase);
    if (direct) return direct;
    // possessives / plurals: "michaels" → "michael", "pecas"…
    if (phrase.endsWith("s")) return index.byAlias.get(phrase.slice(0, -1));
    return undefined;
  };

  for (let n = Math.min(index.maxTokens, tokens.length); n >= 1; n--) {
    for (let i = 0; i + n <= tokens.length; i++) {
      if (taken.slice(i, i + n).some(Boolean)) continue;
      const phrase = tokens.slice(i, i + n).join(" ");
      if (n === 1 && (phrase.length < 3 || AMBIGUOUS_SINGLE.has(phrase))) {
        // ambiguous single words only count when they are the whole alias of an entity AND the query is very short
        if (tokens.length > 3 || phrase.length < 3) continue;
      }
      const refs = lookup(phrase);
      if (!refs) continue;
      for (let k = i; k < i + n; k++) taken[k] = true;
      matches.push({ alias: phrase, start: i, end: i + n, refs });
    }
  }
  matches.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const seen = new Set<string>();
  const entities: EntityRef[] = [];
  for (const m of matches) {
    for (const r of m.refs) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        entities.push(r);
      }
    }
  }
  return { matches, entities };
}
