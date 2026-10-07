/**
 * Table pages: the GTA V weapon list (category · availability · cost · upgrades) and the safehouse table
 * (character · location · unlocked by · notes). Weapons that need a DLC update are marked with that update and their
 * Story Mode availability is left UNKNOWN unless the base game includes them (never assumed).
 */
import { articleHtml, tables } from "../html";
import { gtwRef, idFor, page, protagonistsIn, PROTAGONISTS, type DraftRelation, type EntityDraft, type ExtractResult } from "./common";

export function extractTables(): ExtractResult {
  const entities: EntityDraft[] = [];
  const issues: string[] = [];

  const w = page("Weapons_in_GTA_V");
  if (w) {
    const rows = tables(articleHtml(w.html)).flat().filter((r) => r.length >= 6 && r[0] !== "In-game name");
    for (const [name, , category, availability, cost, upgrades] of rows) {
      if (!name) continue;
      const base = /base game/i.test(availability ?? "");
      entities.push({
        id: idFor("weapon", name), type: "weapon", name,
        summary: `${name} — ${category} weapon in Grand Theft Auto V. ${base ? "Included in the base game." : `Added by ${availability}; whether it can be used in Story Mode is not stated on the source page.`}`,
        verification: "curated", confidence: 0.7,
        sources: [gtwRef(w, `${name} · ${category} · ${availability} · ${cost} · upgrades: ${upgrades}`)],
        attrs: {
          weapon_class: category, release: availability, cost, upgrades,
          availability: base ? "STORY_MODE" : "UNKNOWN",
        },
      });
    }
    issues.push(`${rows.length} weapons (${rows.filter((r) => /base game/i.test(r[3] ?? "")).length} base game)`);
  } else issues.push("Weapons_in_GTA_V not cached");

  const s = page("Safehouses_in_GTA_V");
  if (s) {
    const rows = tables(articleHtml(s.html)).flat().filter((r) => r.length >= 5 && r[0] !== "Name");
    for (const [name, character, location, unlockedBy, notes] of rows) {
      if (!name) continue;
      const who = protagonistsIn(character ?? "");
      const area = (location ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(-2, -1)[0];
      const rel: DraftRelation[] = [
        ...who.map((p) => ({ predicate: "available_to" as const, to: PROTAGONISTS[p as keyof typeof PROTAGONISTS] })),
        ...(area ? [{ predicate: "located_in" as const, toName: area }] : []),
        ...(unlockedBy ? [{ predicate: "requires" as const, toName: unlockedBy }] : []),
      ];
      entities.push({
        id: idFor("location", name), type: "location", name,
        summary: `${name} — safehouse of ${(character ?? "").replace(/\n/g, ", ")} at ${location}. Unlocked by ${unlockedBy}.`,
        verification: "curated", confidence: 0.75,
        sources: [gtwRef(s, `${name} · ${character} · ${location} · unlocked by ${unlockedBy}`)],
        attrs: { safehouse: true, address: location, unlocked_by: unlockedBy },
        sections: [{ kind: "requirements", title: "Safehouse availability (Grand Theft Wiki)", text: `${name}: unlocked by ${unlockedBy}. ${(notes ?? "").replace(/\n/g, " ")}`.trim() }],
        relations: rel,
      });
    }
    issues.push(`${rows.length} safehouses`);
  } else issues.push("Safehouses_in_GTA_V not cached");
  return { name: "tables", entities, issues };
}
