/**
 * GTA V characters from Grand Theft Wiki character pages (infobox + history + mission appearances).
 * Relationship edges (family, hook-ups) are only created from explicit statements on the page:
 *  - family_of  ← the infobox "Family" links;
 *  - hookup_with ← a sentence that names a protagonist AND says the character can be met / called for a booty call.
 * Nothing is inferred beyond what the page says; the sentence itself is stored as the edge's evidence.
 */
import { articleHtml, infobox, lead, listItems, paragraphs, sections } from "../html";
import { listCached } from "../http";
import { clip, GTW, gtwRef, idFor, page, PROTAGONISTS, type DraftRelation, type EntityDraft, type ExtractResult, type Page } from "./common";

const pageName = (url: string) => decodeURIComponent(url.slice(GTW.length + 1));
const cleanName = (title: string) => title.replace(/ \((GTA V|character|GTA V character)\)$/, "").trim();
const field = (box: ReturnType<typeof infobox>, ...labels: string[]) => labels.map((l) => box.fields[l]).find(Boolean);

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}

export function characterDraft(p: Page): EntityDraft | null {
  const box = infobox(p.html);
  if (!/Character/i.test(box.caption)) return null;
  const appearances = field(box, "Appearances", "Appearance(s)")?.text ?? "";
  if (!/\bGTA V\b/.test(appearances)) return null;
  const article = articleHtml(p.html);
  const intro = lead(article);
  if (!intro) return null;
  const name = cleanName(p.title);
  const blocks = sections(article);
  // Characters who also appear in other GTA games: their history mixes games, so only GTA V-specific parts are kept.
  const multiGame = appearances.replace(/\bGTA V\b/g, "").replace(/GTA Online|Online/g, "").match(/\b(GTA|The Lost|The Ballad|Chinatown)\b/) !== null;
  const history = multiGame ? undefined : blocks.find((s) => /history|biography|background/i.test(s.heading));
  const historyText = history ? paragraphs(history.html).join(" ") : "";
  const missionBlock = blocks.find((s) => /mission appearances?|missions/i.test(s.heading));
  // Appearances are grouped per game (<dt>GTA V</dt> … <dt>GTA Online</dt> …): keep only the GTA V group(s).
  const storyOnly = (html: string) => {
    const groups = html.split(/(?=<dl><dt>)/i);
    if (groups.length <= 1) return html;
    return groups.filter((g) => /<dt>\s*GTA V\s*<\/dt>/i.test(g)).join("");
  };
  // Navboxes (tables) follow the last section — drop them; strip role notes such as "(Boss)" or "(can be killed)".
  const missions = missionBlock
    ? [...new Set(listItems(storyOnly(missionBlock.html).replace(/<table[\s\S]*?<\/table>/gi, "").replace(/<div[^>]*class="[^"]*navbox[\s\S]*$/i, ""))
        .flatMap((l) => l.split(/\s*(?:·|\n)\s*/))
        .map((m) => m.replace(/^GTA V\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim())
        .filter((m) => m.length >= 3 && m.length < 60))]
    : [];
  const trivia = blocks.find((s) => /trivia/i.test(s.heading));
  const triviaItems = trivia ? listItems(trivia.html) : [];

  const rel: DraftRelation[] = [];
  for (const fam of field(box, "Family")?.links ?? []) if (!/^(Gender|DOD|DOB)::/.test(fam)) rel.push({ predicate: "family_of", toName: cleanName(fam) });
  const home = field(box, "Home", "Residence");
  const homePlace = home?.links.find((l) => !/^(Los Santos|San Andreas)( in GTA V)?$/.test(l));
  if (homePlace) rel.push({ predicate: "lives_at", toName: homePlace.replace(/ in GTA V$/, "") });
  for (const m of missions) rel.push({ predicate: "appears_in", toName: m.replace(/^GTA V /, "") });

  // Hook-ups / booty calls: only explicit sentences naming a protagonist.
  const all = [...new Set([intro, historyText, ...triviaItems])].join(" ");
  const hookupSentences = [...new Set(sentences(all))].filter((s) => /booty call|her phone number|his phone number|girlfriend|boyfriend|date with/i.test(s));
  const sections_: NonNullable<EntityDraft["sections"]> = [];
  if (historyText) sections_.push({ kind: "details", title: "Character history (Grand Theft Wiki, abridged)", text: clip(historyText, 900) });
  if (missions.length) sections_.push({ kind: "missions", title: "Mission appearances", text: `${name} appears in: ${missions.join("; ")}.` });
  const isProtagonist = (Object.values(PROTAGONISTS) as string[]).includes(idFor("character", name));
  if (hookupSentences.length && !isProtagonist) {
    // Only call it a booty call when the text says so ("girlfriend of <someone else>" is just a relationship).
    const bootyCall = hookupSentences.some((s) => /booty call/i.test(s));
    sections_.push({ kind: "relationship", title: bootyCall ? "Relationship / booty call (Grand Theft Wiki)" : "Relationships (Grand Theft Wiki)", text: hookupSentences.join(" ") });
    // A hook-up EDGE needs an explicit "booty call" on this character's own page, plus the protagonists the page says
    // can meet them. "Girlfriend of <someone else>" sentences stay text only (no edge, no invented romance).
    if (/booty call/i.test(all)) {
      const who = new Set<string>();
      for (const s of sentences(all)) {
        if (!/(can meet|who can meet|meet (?:her|him)|booty call|phone number)/i.test(s)) continue;
        for (const pn of ["Michael", "Franklin", "Trevor"] as const) if (new RegExp(`\\b${pn}\\b`).test(s)) who.add(pn);
      }
      const evidence = clip(hookupSentences.filter((s) => /booty call|meet/i.test(s)).join(" "), 280);
      for (const pn of who) rel.push({ predicate: "hookup_with", to: PROTAGONISTS[pn as keyof typeof PROTAGONISTS], props: { evidence, kind: "booty call (hook-up)" } });
    }
  }
  if (triviaItems.length) sections_.push({ kind: "trivia", title: "Trivia (Grand Theft Wiki)", text: clip(triviaItems.slice(0, 6).join(" "), 900) });

  const attrs: Record<string, unknown> = {};
  const pick = (k: string, ...labels: string[]) => {
    const v = field(box, ...labels)?.text.replace(/^Gender::/, "").replace(/DOD::\S+/, "").trim();
    if (v && v !== "{{{caption}}}") attrs[k] = clip(v, 200);
  };
  pick("full_name", "Full Name");
  pick("gender", "Gender");
  pick("home", "Home", "Residence");
  pick("family", "Family");
  pick("affiliations", "Main Affiliations", "Affiliations");
  pick("status", "Date of Death");
  pick("voiced_by", "Voiced by");
  const aliases = (field(box, "Aliases", "Nickname")?.text ?? "").split(/\s*[·,]\s*/).map((a) => a.replace(/\s*\([^)]*\)/, "").trim()).filter((a) => a && a.length < 40);

  return {
    id: idFor("character", name), type: "character", name, aliases,
    summary: clip(intro, 500),
    verification: "curated", confidence: 0.75,
    sources: [gtwRef(p, intro)],
    attrs, sections: sections_, relations: rel,
  };
}

export function extractCharacters(): ExtractResult {
  const entities: EntityDraft[] = [];
  for (const url of listCached("www.grandtheftwiki.com")) {
    const p = page(pageName(url));
    if (!p) continue;
    const d = characterDraft(p);
    if (d) entities.push(d);
  }
  const hookups = entities.filter((e) => e.relations?.some((r) => r.predicate === "hookup_with")).map((e) => e.name);
  return { name: "characters", entities, issues: [`${entities.length} GTA V character pages parsed`, `hook-up edges from: ${hookups.join(", ") || "none"}`] };
}
