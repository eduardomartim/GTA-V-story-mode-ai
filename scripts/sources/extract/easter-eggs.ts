/**
 * Easter eggs and references (Grand Theft Wiki "Secrets and Easter Eggs in GTA V").
 * One entity per list item. Titles are short descriptive labels written for the KB (the facts stay in the source text).
 * Items that describe GTA Online features are skipped (Story Mode only). A place is linked only when the item links
 * to a known named area; time windows ("between 23:00 and 0:00") are kept as attributes.
 */
import fs from "node:fs";
import path from "node:path";
import { articleHtml, decode, toText } from "../html";
import { clip, gtwRef, idFor, page, type DraftRelation, type EntityDraft, type ExtractResult } from "./common";

/** Hand-written labels for the main easter eggs (matched on distinctive words of the source text). */
const TITLES: Array<[RegExp, string]> = [
  [/frozen creek.*alien/i, "Frozen alien under the ice (Prologue, Ludendorff)"],
  [/Bigfoot/i, "Bigfoot in the thermal scope (Predator)"],
  [/sunken flying saucer/i, "Sunken UFO north-east of Paleto Bay"],
  [/Three more UFOs/i, "UFOs over Mount Chiliad, Fort Zancudo and Sandy Shores after 100%"],
  [/juice stand with a big orange ball/i, "Rolling BIG Orange juice-stand ball (Vinewood Hills)"],
  [/Another 'BIG Orange'/i, "Second BIG Orange juice stand (Grapeseed / San Chianski)"],
  [/female ghost/i, "Ghost on Mount Gordo (23:00–00:00)"],
  [/mouse cursor/i, "Middle-finger mouse cursor on computers"],
  [/948-555-0100/i, "Dial-up internet sound phone number"],
  [/crashed US Air jet/i, "Crashed jet on the seabed (Paleto Forest)"],
  [/'Hatch'/i, "The Hatch from Lost (sea floor, east coast)"],
  [/black light\/UV light/i, "Black-light secrets on the Collector's Edition map"],
  [/special stash/i, "Franklin's 'special stash' (Strawberry safehouse)"],
  [/Sugar Puffs/i, "Sugar Puffs-like cereal in Trevor's trailer"],
  [/fire at Michael's house/i, "Michael reacts when his house is shot at"],
  [/sneak near his house/i, "Michael notices when you sneak near his house"],
  [/follows a protagonist/i, "Followed protagonist knocks the player out"],
  [/blueprint of the beta map/i, "Beta map blueprint in Franklin's safehouse"],
  [/Panzer Tank/i, "Sunken tank near Humane Labs"],
  [/gone in sixty seconds/i, "Gone in 60 Seconds reference (I Fought the Law)"],
];

const ONLINE_ONLY = /\b(Grand Theft Auto Online|GTA Online)\b.*\b(character creation|you can also purchase|is possible to get)\b|^In the Grand Theft Auto Online\b/i;

function gazetteerNames(): Map<string, string> {
  const file = path.join(process.cwd(), "data", "gazetteer.json");
  const areas = (JSON.parse(fs.readFileSync(file, "utf8")) as { areas: Array<{ name: string; aliases?: string[] }> }).areas;
  const m = new Map<string, string>();
  for (const a of areas) for (const n of [a.name, ...(a.aliases ?? [])]) m.set(n.toLowerCase(), a.name);
  for (const extra of ["Ludendorff", "Mount Gordo", "Raton Canyon", "Del Perro Pier", "Humane Labs and Research"]) m.set(extra.toLowerCase(), extra);
  return m;
}

export function extractEasterEggs(): ExtractResult {
  const p = page("Secrets_and_Easter_Eggs_in_GTA_V");
  if (!p) return { name: "easter-eggs", entities: [], issues: ["Secrets_and_Easter_Eggs_in_GTA_V not cached"] };
  const places = gazetteerNames();
  const entities: EntityDraft[] = [];
  const issues: string[] = [];
  const article = articleHtml(p.html);
  // Section of each <li>: the nearest preceding h2/h3 heading.
  let section = "";
  let skippedOnline = 0;
  const used = new Set<string>();
  for (const m of article.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>|<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    if (m[1] !== undefined) { section = toText(m[1]); continue; }
    const html = m[2] as string;
    const text = toText(html).replace(/\s+/g, " ").trim();
    if (text.length < 40 || /^(See also|External links)/i.test(section)) continue; // name-only lists (returning characters…)
    if (ONLINE_ONLY.test(text)) { skippedOnline++; continue; }
    const labelled = TITLES.find(([re]) => re.test(text))?.[1];
    const isReference = /reference|nod|resembl/i.test(text) || /References/i.test(section);
    // Unlabelled items: a prefix keeps the title from being a bare place or character name (which would hijack that alias).
    const gist = clip(text.split(/(?<=[.!?])\s/)[0]?.replace(/[.!?]$/, "") ?? text, 70);
    const title = labelled ?? `${isReference ? "Reference" : "Easter egg"}: ${gist}`;
    let id = idFor("easter_egg", title);
    while (used.has(id)) id += "-2";
    used.add(id);
    const links = [...html.matchAll(/<a [^>]*title="([^"]+)"[^>]*>/g)].map((x) => decode(x[1] as string).replace(/ \(page does not exist\)$/, "").replace(/ in GTA V$/, ""));
    const rel: DraftRelation[] = [];
    for (const l of [...new Set(links)]) {
      const place = places.get(l.toLowerCase());
      if (place) rel.push({ predicate: "located_in", toName: place });
      else rel.push({ predicate: "related_to", toName: l });
    }
    const time = text.match(/between (\d{1,2}:\d{2}) and (\d{1,2}:\d{2})/i);
    entities.push({
      id, type: "easter_egg", name: title,
      summary: clip(text, 600),
      verification: "curated", confidence: 0.7,
      sources: [gtwRef(p, text)],
      attrs: { kind: isReference ? "reference" : "easter egg / secret", section, ...(time ? { time_window: `${time[1]}–${time[2]}` } : {}) },
      relations: rel,
    });
  }
  issues.push(`${entities.length} easter eggs / references; ${skippedOnline} items skipped because they describe GTA Online features`);
  return { name: "easter-eggs", entities, issues };
}
