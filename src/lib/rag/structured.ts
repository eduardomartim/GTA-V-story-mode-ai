import type { Db } from "@/lib/db/client";
import { normalize } from "@/lib/text";
import type { Candidate, QueryAnalysis } from "./types";

// "Qual é a ordem das missões do Trevor?" asks for the same ordered list as "todas as missões do Trevor".
const LIST_RE = /\b(todas?|todos|all|every|list|lista|listar|quais (sao|missoes)|which|ordem|order|sequencia|sequence|cronologi\w*)\b/;
const FIRST_RE = /\b(primeir[ao]s?|first|earliest)\b/;
const MISSION_WORD = /\b(missao|missoes|mission|missions)\b/;
const MISSIONS_LIST_URL = "https://www.grandtheftwiki.com/Missions_in_GTA_V";

type SourceMeta = { name: string; authority: number };

async function sourceMeta(db: Db, id: string): Promise<SourceMeta> {
  const rows = await db.query<SourceMeta>("select name, authority from sources where id = $1", [id]);
  return rows[0] ?? { name: id, authority: 1 };
}

function synthetic(partial: Pick<Candidate, "entityId" | "entityType" | "entityName" | "content"> & Partial<Candidate>, source: SourceMeta & { id: string; url: string }, n: number): Candidate {
  return {
    chunkId: -n, contentType: "list", sourceId: source.id, sourceName: source.name, sourceType: "wiki", sourceUrl: source.url, authority: source.authority,
    confidence: 0.9, verification: "verified", spoilerLevel: 0, versions: [], semantic: 0, keyword: 0, entityScore: 1, via: ["entity"], score: 0, ...partial,
  };
}

/**
 * Structured SQL lookups for "list/all" questions ("all Lester missions", "all heists"). These answer
 * exhaustively from typed tables instead of hoping that top-k chunks happen to cover everything.
 */
export async function structuredLookups(db: Db, analysis: QueryAnalysis): Promise<Candidate[]> {
  const q = normalize(analysis.original);
  const out: Candidate[] = [];
  if (MISSION_WORD.test(q) && FIRST_RE.test(q)) {
    // "first mission of Franklin (after the prologue)": earliest entries in the documented story order.
    const meta = await sourceMeta(db, "grandtheftwiki");
    for (const ch of analysis.entities.filter((e) => e.type === "character").slice(0, 1)) {
      const first = ch.name.split(" ")[0] as string;
      const skipPrologue = /prolog/.test(q);
      const rows = await db.query<{ id: string; name: string; sequence: number }>(
        `select e.id, e.name, m.sequence from missions m join entities e on e.id = m.entity_id
          where ($1 = any(m.protagonists) or m.giver = $2) and ($3::boolean = false or m.mission_type <> 'prologue') and m.sequence is not null order by m.sequence limit 3`, [first, ch.name, skipPrologue]);
      if (rows.length) {
        out.push(synthetic({
          entityId: rows[0]?.id ?? ch.id, entityType: rows[0] ? "mission" : "character", entityName: rows[0]?.name ?? ch.name,
          content: `Earliest story missions featuring ${ch.name}${skipPrologue ? " after the Prologue" : ""}, in the story order listed by Grand Theft Wiki: ${rows.map((r) => `#${r.sequence} ${r.name}`).join("; ")}.`,
        }, { ...meta, id: "grandtheftwiki", url: MISSIONS_LIST_URL }, 20));
      }
    }
  }
  if (!LIST_RE.test(q)) return out;

  if (MISSION_WORD.test(q)) {
    const meta = await sourceMeta(db, "grandtheftwiki");
    const chars = analysis.entities.filter((e) => e.type === "character").slice(0, 2);
    for (const ch of chars) {
      const playable = ["character:michael-de-santa", "character:franklin-clinton", "character:trevor-philips"].includes(ch.id);
      const rows = await db.query<{ name: string; sequence: number; mission_type: string }>(
        playable
          ? "select e.name, m.sequence, m.mission_type from missions m join entities e on e.id = m.entity_id where $1 = any(m.protagonists) order by m.sequence"
          : "select e.name, m.sequence, m.mission_type from missions m join entities e on e.id = m.entity_id where m.giver = $1 order by m.sequence",
        [playable ? (ch.name.split(" ")[0] as string) : ch.name],
      );
      if (!rows.length) continue;
      const verb = playable ? `played as ${ch.name}` : `given by ${ch.name}`;
      out.push(synthetic({
        entityId: ch.id, entityType: "character", entityName: ch.name,
        content: `Story missions ${verb} (${rows.length}), in story order: ${rows.map((r) => `${r.sequence}. ${r.name}${r.mission_type === "assassination" ? " (assassination)" : r.mission_type.startsWith("heist") ? ` (${r.mission_type.replace("_", " ")})` : ""}`).join("; ")}.`,
      }, { ...meta, id: "grandtheftwiki", url: MISSIONS_LIST_URL }, out.length + 1));
    }
  }

  const listTypes: Array<[RegExp, string, string]> = [
    [/\b(heists?|assaltos?)\b/, "heist", "Heists in Story Mode"],
    [/\b(collectibles?|colecionaveis|coletaveis)\b/, "collectible", "Collectible types in Story Mode"],
    [/\b(cheats?|truques?|codigos)\b/, "cheat", "Cheats with validated PC codes"],
    [/\b(endings?|finais)\b/, "ending", "Endings"],
  ];
  for (const [re, type, title] of listTypes) {
    if (!re.test(q)) continue;
    const rows = await db.query<{ id: string; name: string; summary: string; spoiler_level: number }>(
      "select id, name, summary, spoiler_level from entities where type = $1 and online_only = false and name not ilike '%overview%' order by name", [type]);
    if (!rows.length) continue;
    const meta = await sourceMeta(db, "gta-wiki");
    out.push(synthetic({
      entityId: rows[0]!.id, entityType: type as Candidate["entityType"], entityName: title,
      content: `${title}: ${rows.map((r) => r.name).join("; ")}.`,
      spoilerLevel: Math.max(...rows.map((r) => r.spoiler_level)),
    }, { ...meta, id: "gta-wiki", url: "https://gta.fandom.com/wiki/Grand_Theft_Auto_V" }, out.length + 10));
  }
  return out;
}
