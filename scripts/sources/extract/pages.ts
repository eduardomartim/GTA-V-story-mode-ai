/**
 * Article pages that enrich existing places, hobbies and activities (merge), plus the Parachute Jumps list.
 * Each kept section is clipped and attributed; navigation-only sections (roads, galleries, videos) are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { articleHtml, lead, leadBlock, listItems, paragraphs, sections, toText } from "../html";
import { listCached } from "../http";
import { clip, GTW, gtwRef, idFor, page, protagonistsIn, PROTAGONISTS, type DraftRelation, type EntityDraft, type ExtractResult, type Page } from "./common";

const SKIP = /^(Gallery|Video|Videos|Video walkthrough|See also|External links|Known Roads and Streets|Businesses|Navigation|References|Notes)$/i;

/** Pages that describe an entity the KB already has (or should have) under a known id. */
const MAPPED: Array<{ page: string; id: string; type: EntityDraft["type"]; name: string }> = [
  { page: "Golf", id: "hobby:golf", type: "hobby", name: "Golf" },
  { page: "Tennis", id: "hobby:tennis", type: "hobby", name: "Tennis" },
  { page: "Darts", id: "hobby:darts", type: "hobby", name: "Darts" },
  { page: "Triathlon", id: "hobby:triathlon", type: "hobby", name: "Triathlon" },
  { page: "Flight_School", id: "hobby:flight-school", type: "hobby", name: "Flight School" },
  { page: "Yoga", id: "hobby:yoga", type: "hobby", name: "Yoga" },
  { page: "Parachute_Jumps", id: "hobby:parachuting", type: "hobby", name: "Parachuting" },
  { page: "Hunting", id: "activity:hunting", type: "activity", name: "Hunting" },
  { page: "Shooting_Range", id: "hobby:shooting-range", type: "hobby", name: "Shooting Range" },
  { page: "Street_Races", id: "hobby:hao-street-races", type: "hobby", name: "Hao Street Races" },
  { page: "Off-Road_Races", id: "hobby:off-road-races", type: "hobby", name: "Off-Road Races" },
  { page: "Sea_Races", id: "hobby:sea-races", type: "hobby", name: "Sea Races" },
  { page: "Vanilla_Unicorn", id: "location:vanilla-unicorn", type: "location", name: "Vanilla Unicorn" },
  { page: "Mount_Chiliad_in_GTA_V", id: "location:mount-chiliad", type: "location", name: "Mount Chiliad" },
  { page: "Mount_Gordo", id: "location:mount-gordo", type: "location", name: "Mount Gordo" },
  // Purchasable properties / businesses (price, weekly income and buyer are read from the text).
  { page: "Hookies", id: "property:hookies", type: "property", name: "Hookies" },
  { page: "Cinema_Doppler", id: "property:cinema-doppler", type: "property", name: "Cinema Doppler" },
  { page: "Downtown_Cab_Co.", id: "property:downtown-cab-co", type: "property", name: "Downtown Cab Co." },
  { page: "Los_Santos_Golf_Club", id: "property:los-santos-golf-club", type: "property", name: "Los Santos Golf Club" },
  { page: "McKenzie_Field_Hangar", id: "property:mckenzie-field-hangar", type: "property", name: "McKenzie Field Hangar" },
  { page: "The_Hen_House", id: "property:the-hen-house", type: "property", name: "The Hen House" },
  { page: "Sonar_Collections_Dock", id: "property:sonar-collections-dock", type: "property", name: "Sonar Collections Dock" },
  { page: "Tequi-La-La", id: "property:tequi-la-la", type: "property", name: "Tequi-la-la" },
  { page: "Yellow_Jack_Inn", id: "location:yellow-jack-inn", type: "location", name: "Yellow Jack Inn" },
  { page: "Los_Santos_Country_Club", id: "location:los-santos-country-club", type: "location", name: "Los Santos Country Club" },
];

function kept(article: string): NonNullable<EntityDraft["sections"]> {
  const out: NonNullable<EntityDraft["sections"]> = [];
  for (const s of sections(article)) {
    if (!s.heading || SKIP.test(s.heading)) continue;
    // Paragraphs and list items in DOCUMENT order ("three conditions must be met:" followed by the conditions).
    const ordered = [...s.html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>|<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => toText((m[1] ?? m[2] ?? "") as string)).filter(Boolean);
    const text = (ordered.length ? ordered : [...paragraphs(s.html), ...listItems(s.html)]).join(" ").replace(/\s+/g, " ").trim() || toText(s.html);
    if (text.length < 40) continue;
    const kind = /trivia/i.test(s.heading) ? "trivia" : /locat/i.test(s.heading) ? "location" : /reward|prize/i.test(s.heading) ? "reward" : /require|unlock/i.test(s.heading) ? "requirements" : "details";
    out.push({ kind, title: `${s.heading} (Grand Theft Wiki)`, text: clip(text, 900) });
  }
  return out;
}

function enrich(p: Page, id: string, type: EntityDraft["type"], name: string): EntityDraft {
  const article = articleHtml(p.html);
  const intro = lead(article);
  const full = leadBlock(article) || intro;
  // Rules about relationships (e.g. strippers who can be taken home for a booty call) get their own section.
  const rel = full.split(/(?<=[.!?])\s+/).filter((x) => /booty call|take .* home|girlfriend|hook-?up/i.test(x)).join(" ");
  return {
    id, type, name, merge: false,
    summary: clip(intro || `${name} in Grand Theft Auto V.`, 500),
    verification: "curated", confidence: 0.75,
    sources: [gtwRef(p, intro)],
    sections: [
      { kind: "overview", title: "Overview (Grand Theft Wiki)", text: clip(full, 900) },
      ...(rel ? [{ kind: "relationship", title: "Relationships / booty calls (Grand Theft Wiki)", text: clip(rel, 600) }] : []),
      ...kept(article),
    ].filter((s) => s.text.length >= 10),
  };
}

function parachuteJumps(p: Page): EntityDraft[] {
  const article = articleHtml(p.html);
  const block = sections(article).find((s) => s.heading === "Jumps");
  if (!block) return [];
  const out: EntityDraft[] = [];
  for (const m of block.html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const html = m[1] as string;
    const text = toText(html).replace(/\s+/g, " ").trim();
    const name = text.split(/\s+-\s+/)[0]?.trim();
    if (!name || name.length > 40) continue;
    const places = [...html.matchAll(/<a [^>]*title="([^"]+)"[^>]*>/g)].map((x) => (x[1] as string).replace(/ in GTA V$/, "").replace(/ \(page does not exist\)$/, ""));
    const rel: DraftRelation[] = [{ predicate: "part_of", to: "hobby:parachuting" }];
    const first = places.find((x) => !/^(Maverick|Squalo|Skylift|Frogger|Cargobob|Buzzard)$/.test(x));
    if (first) rel.push({ predicate: "starts_at", toName: first });
    out.push({
      id: idFor("activity", `parachute jump ${name}`), type: "activity", name: `Parachute Jump: ${name}`,
      aliases: [name], summary: clip(text, 500), verification: "curated", confidence: 0.75,
      sources: [gtwRef(p, text)], attrs: { kind: "parachute jump", counts_for_100: true, completion_rule: "all parachute jumps are required for 100% (Completion in GTA V)" },
      relations: rel,
    });
  }
  return out;
}

/** Every cached page that is about a place the KB / gazetteer knows: lead + sections merged into that location. */
function placePages(): EntityDraft[] {
  const gaz = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gazetteer.json"), "utf8")) as { areas: Array<{ name: string }> }).areas.map((a) => a.name);
  const names = new Set(gaz.map((n) => n.toLowerCase()));
  const out: EntityDraft[] = [];
  for (const url of listCached("www.grandtheftwiki.com")) {
    const title = decodeURIComponent(url.slice(GTW.length + 1)).replace(/_/g, " ").replace(/ in GTA V$/, "");
    if (!names.has(title.toLowerCase()) || MAPPED.some((m) => m.name.toLowerCase() === title.toLowerCase())) continue;
    const p = page(decodeURIComponent(url.slice(GTW.length + 1)));
    if (!p) continue;
    const d = enrich(p, idFor("location", title), "location", title);
    if (/Grand Theft Auto V|GTA V/.test(d.summary) || d.sections?.length) out.push(d);
  }
  return out;
}

export function extractPages(): ExtractResult {
  const entities: EntityDraft[] = [];
  const issues: string[] = [];
  for (const m of MAPPED) {
    const p = page(m.page);
    if (!p) { issues.push(`${m.page}: not cached`); continue; }
    const d = enrich(p, m.id, m.type, m.name);
    if (m.type === "property") {
      // "can be purchased by Franklin for $ 200,000" · "generates $2,000 per week" · "Trevor is the only protagonist who can't own"
      const text = [d.summary, ...(d.sections ?? []).map((s) => s.text)].join(" ");
      const price = text.match(/purchas\w*[^$.]{0,160}?for \$\s?(\d[\d,]*\d)/i)?.[1];
      const income = text.match(/\$\s?([\d,]+) (?:per|a|each) week/i)?.[1] ?? text.match(/weekly (?:return|income|profit) of \$\s?([\d,]+)/i)?.[1];
      const after = text.match(/after (?:completing )?the mission ([A-Z][\w' -]+?)[,.]/)?.[1];
      const buyerSentence = text.split(/(?<=[.!?])\s+/).find((x) => /purchas|own this property|can be bought|buy/i.test(x)) ?? "";
      let buyers = protagonistsIn(buyerSentence);
      const excluded = text.match(/(Michael|Franklin|Trevor) is the only protagonist who can'?t own/i)?.[1];
      if (excluded) buyers = (["Michael", "Franklin", "Trevor"] as const).filter((x) => x !== excluded);
      d.attrs = { ...(price ? { price: `$${price}` } : {}), ...(income ? { weekly_income: `$${income}` } : {}), ...(buyers.length ? { buyable_by: buyers } : {}) };
      d.relations = [
        ...buyers.map((pn) => ({ predicate: "available_to" as const, to: PROTAGONISTS[pn as keyof typeof PROTAGONISTS] })),
        ...(after ? [{ predicate: "requires" as const, toName: after.trim() }] : []),
      ];
      if (after) d.attrs.available_after = after.trim();
      entities.push(d);
      continue;
    }
    const who = protagonistsIn(d.summary);
    d.relations = who.map((pn) => ({ predicate: "available_to" as const, to: PROTAGONISTS[pn as keyof typeof PROTAGONISTS] }));
    entities.push(d);
    if (m.page === "Parachute_Jumps") entities.push(...parachuteJumps(p));
  }
  const places = placePages();
  entities.push(...places);
  issues.push(`${entities.length} drafts (${places.length} place pages, ${entities.filter((e) => e.name.startsWith("Parachute Jump:")).length} parachute jumps)`);
  return { name: "pages", entities, issues };
}
