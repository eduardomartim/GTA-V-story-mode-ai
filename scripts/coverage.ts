import "./_boot";
import { buildChunks } from "@/lib/kb/ingest";
import { loadKnowledgeBase } from "@/lib/kb/load";

/**
 * Honest coverage report: counts knowledge *chunks* (one per overview/section) by status, per category.
 * VERIFIED = corroborated by ≥2 independent sources · CURATED = single source / author knowledge · UNVERIFIED = conflicting/weak.
 * "Backlog" = open items in data/kb/backlog.json that we deliberately did not invent.
 */
const kb = loadKnowledgeBase();
const CATS: Array<[string, (t: string, id: string) => boolean, RegExp]> = [
  ["Missions", (t) => t === "mission", /mission|walkthrough|unlock chain|missable|gold/i],
  ["Heists", (t) => t === "heist", /heist|crew|payout|merryweather/i],
  ["Characters", (t) => t === "character", /character|stranger chains/i],
  ["Vehicles", (t) => t === "vehicle", /vehicle/i],
  ["Weapons", (t) => t === "weapon", /weapon|railgun/i],
  ["Locations", (t) => t === "location", /coordinate|location/i],
  ["Collectibles", (t) => t === "collectible", /collectible|monkey|epsilon|hidden packages|submarine location/i],
  ["Activities", (t) => ["activity", "hobby", "random_event", "completion"].includes(t), /stranger|random event|hobb|100%|strangers/i],
  ["Properties", (t) => t === "property", /propert/i],
  ["Cheats", (t) => t === "cheat", /cheat/i],
  ["Troubleshooting", (t) => t === "troubleshooting", /unlock chain|version/i],
];
const rows: string[] = [];
let totals = { v: 0, c: 0, u: 0, b: 0, e: 0 };
for (const [name, match, re] of CATS) {
  const ents = kb.entities.filter((e) => match(e.type, e.id));
  const chunks = ents.flatMap(buildChunks);
  const v = chunks.filter((c) => c.status === "verified").length;
  const c = chunks.filter((x) => x.status === "curated").length;
  const u = chunks.filter((x) => x.status === "unverified").length;
  const b = kb.backlog.filter((i) => re.test(`${i.topic} ${i.note}`) || (i.entity_id && match(i.entity_id.split(":")[0] ?? "", i.entity_id))).length;
  totals = { v: totals.v + v, c: totals.c + c, u: totals.u + u, b: totals.b + b, e: totals.e + ents.length };
  rows.push(`| ${name} | ${ents.length} | ${v} | ${c} | ${u} | ${b} |`);
}
console.log("| Category | Entities | Verified | Curated | Unverified | Backlog items |\n|---|---:|---:|---:|---:|---:|");
console.log(rows.join("\n"));
console.log(`| **Total** | ${totals.e} | ${totals.v} | ${totals.c} | ${totals.u} | ${kb.backlog.length} |`);

const all = kb.entities.flatMap(buildChunks);
const n = (s: string) => all.filter((c) => c.status === s).length;
console.log(`\nWhole knowledge base: ${kb.entities.length} entities · ${all.length} chunks · VERIFIED ${n("verified")} · CURATED ${n("curated")} · UNVERIFIED ${n("unverified")} · BACKLOG ${kb.backlog.length} open items`);
