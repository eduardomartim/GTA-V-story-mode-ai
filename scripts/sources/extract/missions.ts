/**
 * Missions (story + Strangers and Freaks) from Grand Theft Wiki mission pages: the infobox gives protagonist(s),
 * who the mission is for, objective, location, fail conditions, reward and the unlock chain; gold-medal sections
 * are taken when present. Story narrative of main missions is deliberately NOT imported (spoilers, and the KB
 * already has an original outline); Strangers and Freaks get a short clipped synopsis.
 */
import { articleHtml, infobox, lead, listItems, paragraphs, sections, toText, wikiLinks } from "../html";
import { listCached } from "../http";
import { clip, GTW, gtwRef, idFor, page, PROTAGONISTS, protagonistsIn, type DraftRelation, type EntityDraft, type ExtractResult, type Page } from "./common";

const pageName = (url: string) => decodeURIComponent(url.slice(GTW.length + 1));
const cleanName = (title: string) => title.replace(/ \(mission\)$/, "").replace(/ \(GTA V\)$/, "").trim();

/** Most specific place in a "Location" cell: skip streets and the region/city itself. */
function placeOf(links: string[]): string | undefined {
  const places = links.filter((l) => !/( (St|Ave|Rd|Blvd|Dr|Way|Pkwy|Ln|Fwy|Hwy)$|^Route \d+|in GTA V$|^(Los Santos|Blaine County|San Andreas|North Yankton)$)/.test(l));
  return places[0];
}

let strangerCache: Set<string> | undefined;
/** Pages linked from the "Strangers and Freaks" overview (strangers and their missions). */
function strangerMissionNames(): Set<string> {
  if (!strangerCache) {
    const p = page("Strangers_and_Freaks");
    strangerCache = new Set(p ? wikiLinks(articleHtml(p.html)).map((l) => cleanName(l.replace(/_/g, " "))) : []);
  }
  return strangerCache;
}

export function missionDraft(p: Page): EntityDraft | null {
  const box = infobox(p.html);
  if (box.caption !== "Mission" || !/GTA V\b/.test(box.fields.Game?.text ?? "") || /Online/.test(box.fields.Game?.text ?? "")) return null;
  const article = articleHtml(p.html);
  const intro = lead(article);
  const name = cleanName(p.title);
  const isStranger = /Strangers and Freaks/i.test(intro) || strangerMissionNames().has(name);
  const f = box.fields;
  const protagonists = protagonistsIn(f.Protagonist?.text ?? "");
  const rel: DraftRelation[] = protagonists.map((pn) => ({ predicate: "available_to", to: PROTAGONISTS[pn as keyof typeof PROTAGONISTS] }));
  for (const giver of f.For?.links ?? []) rel.push({ predicate: "given_by", toName: cleanName(giver) });
  const place = placeOf(f.Location?.links ?? []);
  if (place) rel.push({ predicate: "starts_at", toName: place.replace(/ in GTA V$/, "") });
  for (const u of f.Unlocks?.links ?? []) rel.push({ predicate: "unlocks", toName: cleanName(u) });
  for (const u of f["Unlocked by"]?.links ?? []) rel.push({ predicate: "requires", toName: cleanName(u) });

  const sections_: NonNullable<EntityDraft["sections"]> = [];
  if (f.Objective?.text) sections_.push({ kind: "objectives", title: "Objective (Grand Theft Wiki infobox)", text: f.Objective.text });
  if (f.Location?.text) sections_.push({ kind: "location", title: "Where it starts", text: `${name} takes place at / starts from: ${f.Location.text}.` });
  if (f.Fail?.text) sections_.push({ kind: "failure", title: "Fail conditions (Grand Theft Wiki infobox)", text: `${name} fails if: ${f.Fail.text.split(/\n| · /).map((s) => s.trim()).filter(Boolean).join("; ")}.` });
  if (f.Reward?.text) sections_.push({ kind: "reward", title: "Reward (Grand Theft Wiki infobox)", text: `Reward listed for ${name}: ${f.Reward.text}.` });
  if (f["Unlocked by"]?.text || f.Unlocks?.text) {
    sections_.push({ kind: "requirements", title: "Unlock chain (Grand Theft Wiki infobox)", text: `${name}${f["Unlocked by"]?.text ? ` is unlocked by ${f["Unlocked by"].text}` : ""}${f["Unlocked by"]?.text && f.Unlocks?.text ? " and" : ""}${f.Unlocks?.text ? ` unlocks ${f.Unlocks.text}` : ""}.` });
  }
  for (const s of sections(article)) {
    if (/gold medal/i.test(s.heading)) {
      const goals = listItems(s.html);
      if (goals.length) sections_.push({ kind: "gold", title: "Gold medal objectives (Grand Theft Wiki)", text: `Gold medal objectives for ${name}: ${goals.join("; ")}.` });
    }
  }
  if (isStranger) {
    const story = sections(article).find((s) => /^(Mission|Walkthrough|Description)$/i.test(s.heading));
    const syn = story ? paragraphs(story.html).join(" ") || toText(story.html) : "";
    if (syn.length > 40) sections_.push({ kind: "walkthrough", title: "What happens (Grand Theft Wiki, abridged)", text: clip(syn.replace(/\s*Mission .* Game\s*GTA V[\s\S]*$/, ""), 700) });
  }

  return {
    id: idFor("mission", name),
    type: "mission",
    name,
    summary: clip(intro || `${name} is a mission in Grand Theft Auto V.`, 500),
    verification: "curated",
    confidence: 0.75,
    sources: [gtwRef(p, intro)],
    attrs: {
      ...(isStranger ? { mission_type: "stranger" } : {}),
      ...(protagonists.length ? { protagonists } : {}),
      ...(f.For?.text ? { for: f.For.text } : {}),
      ...(f.Location?.text ? { start_location: f.Location.text } : {}),
    },
    sections: sections_,
    relations: rel,
  };
}

export function extractMissions(): ExtractResult {
  const entities: EntityDraft[] = [];
  const issues: string[] = [];
  for (const url of listCached("www.grandtheftwiki.com")) {
    const p = page(pageName(url));
    if (!p) continue;
    const d = missionDraft(p);
    if (d) entities.push(d);
  }
  const strangers = entities.filter((e) => e.attrs?.mission_type === "stranger").length;
  issues.push(`${entities.length} mission pages parsed (${strangers} Strangers and Freaks)`);
  return { name: "missions", entities, issues };
}
