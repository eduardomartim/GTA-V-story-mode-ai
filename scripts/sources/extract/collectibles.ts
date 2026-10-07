/**
 * Item-level collectibles and challenges from Grand Theft Wiki list pages (region → area → item).
 * Each item becomes a `collectible_item` entity with its area, region, description and provenance.
 * The page's own stated total is checked against what was parsed; any mismatch is reported as an issue.
 */
import { articleHtml, toText } from "../html";
import { clip, gtwRef, page, protagonistsIn, WORD_NUMBERS, type EntityDraft, type ExtractResult, type Page } from "./common";

interface ListedItem { region: string; area: string; text: string; tag?: string }

/** Walks <h3>Region</h3> <dl><dt>Area</dt></dl> <ul><li>item</li></ul> in document order. */
export function regionAreaItems(article: string): ListedItem[] {
  const out: ListedItem[] = [];
  let region = "";
  let area = "";
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>|<dt[^>]*>([\s\S]*?)<\/dt>|<li[^>]*>([\s\S]*?)<\/li>|<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  let started = false;
  for (const m of article.matchAll(re)) {
    if (m[4] !== undefined) {
      // A new h2 after the list section ends it (e.g. "Letter", "Video walkthrough").
      if (started && out.length) break;
      continue;
    }
    if (m[1] !== undefined) { region = toText(m[1]); area = ""; started = true; continue; }
    if (!started) continue;
    if (m[2] !== undefined) { area = toText(m[2]); continue; }
    if (m[3] !== undefined && area) {
      const raw = m[3];
      const tag = raw.match(/<small>([^<]+)<\/small>/i)?.[1];
      const text = toText(raw.replace(/\(\s*<small>[^<]+<\/small>\s*\)/i, "")).replace(/\s+\./g, ".").trim();
      if (text) out.push({ region, area, text, tag });
    }
  }
  return out;
}

interface Spec {
  page: string;
  category: string; // collectible:<slug> (must exist in the KB)
  kind: string; // singular label, e.g. "Letter Scrap"
  idPrefix: string;
  expected: number;
  countsFor100?: (n: number) => boolean | undefined;
  versions?: string[];
  aliases?: (n: number, it: ListedItem) => string[];
  extraNote?: string;
}

const SPECS: Spec[] = [
  { page: "Letter_Scraps", category: "collectible:letter-scraps", kind: "Letter Scrap", idPrefix: "letter-scrap", expected: 50, countsFor100: () => true },
  { page: "Peyote_Plant", category: "collectible:peyote-plants", kind: "Peyote Plant", idPrefix: "peyote-plant", expected: 27, countsFor100: () => false, versions: ["PS4", "Xbox One", "PC", "PS5", "Xbox Series X|S"] },
  { page: "Under_the_Bridge", category: "collectible:under-the-bridge", kind: "Under the Bridge challenge", idPrefix: "under-the-bridge", expected: 50, extraNote: "25 of the 50 are required for 100% completion (any 25)." },
  { page: "Knife_Flights", category: "collectible:knife-flights", kind: "Knife Flight", idPrefix: "knife-flight", expected: 15, extraNote: "8 of the 15 are required for 100% completion (any 8)." },
  { page: "Unique_Stunt_Jumps", category: "collectible:stunt-jumps", kind: "Stunt Jump", idPrefix: "stunt-jump", expected: 50, extraNote: "25 of the 50 are required for 100% completion (any 25)." },
  { page: "Nuclear_Waste", category: "collectible:nuclear-waste", kind: "Nuclear Waste barrel", idPrefix: "nuclear-waste", expected: 30 },
  { page: "Submarine_Parts", category: "collectible:submarine-pieces", kind: "Submarine Piece", idPrefix: "submarine-piece", expected: 30 },
  { page: "Epsilon_Tracts", category: "collectible:epsilon-tracts", kind: "Epsilon Tract", idPrefix: "epsilon-tract", expected: 10 },
  { page: "Monkey_Mosaics", category: "collectible:monkey-mosaics", kind: "Monkey Mosaic", idPrefix: "monkey-mosaic", expected: 50, versions: ["PS4", "Xbox One", "PC", "PS5", "Xbox Series X|S"] },
];

/** "Two under Calais Ave …" lists two challenges in one line. */
function multiplicity(text: string): number {
  const w = text.match(/^(two|three|four)\b/i)?.[1]?.toLowerCase();
  return w ? (WORD_NUMBERS[w] ?? 1) : 1;
}

/** The total the page itself states ("There are fifty …", "twenty-seven located …"). */
function statedTotal(p: Page): number | undefined {
  const intro = toText(articleHtml(p.html)).slice(0, 1500).toLowerCase();
  const m = intro.match(/\b(?:there are|are|of the|all)\s+(fifty|thirty|twenty-seven|fifteen|ten|twenty|sixty|\d+)\b/);
  if (!m) return undefined;
  const w = m[1] as string;
  return /^\d+$/.test(w) ? Number(w) : WORD_NUMBERS[w];
}

export function extractCollectibles(): ExtractResult {
  const entities: EntityDraft[] = [];
  const issues: string[] = [];
  for (const spec of SPECS) {
    const p = page(spec.page);
    if (!p) { issues.push(`${spec.page}: page not in cache (or blocked) — category left at summary level`); continue; }
    const article = articleHtml(p.html);
    const listed = regionAreaItems(article);
    const items: ListedItem[] = listed.flatMap((it) => Array.from({ length: multiplicity(it.text) }, () => it));
    const stated = statedTotal(p);
    if (!items.length) { issues.push(`${spec.page}: no region/area list found — page layout differs, nothing extracted`); continue; }
    if (items.length !== spec.expected) issues.push(`${spec.page}: parsed ${items.length} items, expected ${spec.expected}${stated ? ` (page states ${stated})` : ""}`);
    // Who can collect: only from a sentence that says so ("can be collected by …"), not from any protagonist mention.
    const intro = toText(articleHtml(p.html)).slice(0, 2000);
    const collectSentence = intro.split(/(?<=[.!?])\s+/).find((s) => /can be (collected|completed|eaten|found) by|can complete the challenge as|collected by/i.test(s)) ?? "";
    const protagonists = protagonistsIn(collectSentence);
    items.forEach((it, i) => {
      const n = i + 1;
      const summary = `${spec.kind} in ${it.area} (${it.region}): ${it.text}${it.tag ? ` Type: ${it.tag}.` : ""}`;
      entities.push({
        id: `collectible_item:${spec.idPrefix}-${n}`,
        type: "collectible_item",
        name: `${spec.kind} #${n} — ${it.area}`,
        aliases: [`${spec.kind} ${n}`, `${spec.kind} #${n}`],
        summary: clip(summary, 600),
        versions: spec.versions ?? [],
        verification: "curated",
        confidence: 0.75,
        sources: [gtwRef(p, `${it.area}: ${it.text}`)],
        attrs: { ...(it.tag ? { variant: it.tag } : {}), numbering: "order of the Grand Theft Wiki list (not an official in-game index)" },
        sections: spec.extraNote ? [{ kind: "completion", title: "100% relevance", text: spec.extraNote }] : [],
        relations: [{ predicate: "instance_of", to: spec.category }, { predicate: "located_in", toName: it.area }],
        location: { area: it.area, region: it.region, coord_precision: "area" },
        item: { category: spec.category, kind: spec.kind, number: n, area: it.area, region: it.region, counts_for_100: spec.countsFor100?.(n), protagonists },
      });
    });
  }
  return { name: "collectibles", entities, issues };
}
