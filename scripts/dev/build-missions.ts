/**
 * Generates data/kb/entities-missions.json from a compact table.
 *
 * The mission list, order, protagonists and givers were cross-checked on 2026-10-06 against
 * Grand Theft Wiki "Missions in GTA V" (https://www.grandtheftwiki.com/Missions_in_GTA_V).
 * Rich, hand-written detail for selected missions lives in MISSION_DETAIL below.
 *
 * Usage: npx tsx scripts/dev/build-missions.ts
 */
import fs from "node:fs";
import path from "node:path";
import { DETAILS, type MissionDetail } from "./data/missions";

type P = "M" | "F" | "T";
type MType = "prologue" | "main" | "heist" | "heist_setup" | "heist_finale" | "assassination" | "ending";

interface Row {
  title: string;
  p: string; // protagonists, e.g. "MF"
  giver?: string;
  type: MType;
  heist?: string; // heist slug this mission belongs to (setups + the heist itself)
  approach?: string;
  spoiler?: 0 | 1 | 2 | 3;
  slug?: string;
  aliases?: string[];
  url?: string; // override grandtheftwiki page
}

const LIST_PAGE = "https://www.grandtheftwiki.com/Missions_in_GTA_V";
const NAMES: Record<P, string> = { M: "Michael", F: "Franklin", T: "Trevor" };
const CHAR_ID: Record<P, string> = { M: "character:michael-de-santa", F: "character:franklin-clinton", T: "character:trevor-philips" };
const GIVER_ID: Record<string, string> = {
  "Simeon Yetarian": "character:simeon-yetarian", "Lamar Davis": "character:lamar-davis", "Lester Crest": "character:lester-crest",
  "Trevor Philips": "character:trevor-philips", "Michael De Santa": "character:michael-de-santa", "Steve Haines": "character:steve-haines",
  "Dave Norton": "character:dave-norton", "Devin Weston": "character:devin-weston", "Franklin Clinton": "character:franklin-clinton",
  "Martin Madrazo": "character:martin-madrazo", "Solomon Richards": "character:solomon-richards", "Ron Jakowski": "character:ron-jakowski", "Tanisha Jackson": "character:tanisha-jackson", "Tao Cheng": "character:tao-cheng",
};

const ROWS: Row[] = [
  { title: "Prologue", p: "MT", type: "prologue", spoiler: 1, aliases: ["Prólogo", "prologo"] },
  { title: "Franklin and Lamar", p: "F", giver: "Simeon Yetarian", type: "main" },
  { title: "Repossession", p: "F", giver: "Simeon Yetarian", type: "main" },
  { title: "Complications", p: "MF", giver: "Simeon Yetarian", type: "main" },
  { title: "Chop", p: "F", giver: "Lamar Davis", type: "main" },
  { title: "The Long Stretch", p: "F", giver: "Lamar Davis", type: "main" },
  { title: "Father/Son", p: "MF", giver: "Michael De Santa", type: "main", slug: "father-son" },
  { title: "Marriage Counseling", p: "MF", giver: "Michael De Santa", type: "main" },
  { title: "Daddy's Little Girl", p: "M", giver: "Michael De Santa", type: "main" },
  { title: "Friend Request", p: "M", giver: "Lester Crest", type: "main" },
  { title: "Casing the Jewel Store", p: "M", giver: "Lester Crest", type: "heist_setup", heist: "jewel-store-job" },
  { title: "Carbine Rifles", p: "M", giver: "Lester Crest", type: "heist_setup", heist: "jewel-store-job", approach: "Loud" },
  { title: "Bugstars Equipment", p: "M", giver: "Lester Crest", type: "heist_setup", heist: "jewel-store-job", approach: "Smart" },
  { title: "BZ Gas Grenades", p: "M", giver: "Lester Crest", type: "heist_setup", heist: "jewel-store-job", approach: "Smart" },
  { title: "The Jewel Store Job", p: "MF", giver: "Lester Crest", type: "heist", heist: "jewel-store-job" },
  { title: "Mr. Philips", p: "T", giver: "Trevor Philips", type: "main", slug: "mr-philips" },
  { title: "Nervous Ron", p: "T", giver: "Trevor Philips", type: "main" },
  { title: "Trevor Philips Industries", p: "T", giver: "Tao Cheng", type: "main" },
  { title: "Crystal Maze", p: "T", giver: "Tao Cheng", type: "main" },
  { title: "Friends Reunited", p: "T", giver: "Trevor Philips", type: "main" },
  { title: "Fame or Shame", p: "MT", giver: "Michael De Santa", type: "main" },
  { title: "Dead Man Walking", p: "M", giver: "Dave Norton", type: "main", spoiler: 1 },
  { title: "Three's Company", p: "MFT", giver: "Dave Norton", type: "main" },
  { title: "By the Book", p: "MT", giver: "Steve Haines", type: "main" },
  { title: "Hood Safari", p: "FT", giver: "Lamar Davis", type: "main" },
  { title: "Did Somebody Say Yoga?", p: "M", giver: "Michael De Santa", type: "main", url: "Did_Somebody_Say_Yoga%3F" },
  { title: "Scouting the Port", p: "T", giver: "Trevor Philips", type: "heist_setup", heist: "merryweather-heist" },
  { title: "Minisub", p: "T", giver: "Trevor Philips", type: "heist_setup", heist: "merryweather-heist" },
  { title: "Cargobob", p: "T", giver: "Trevor Philips", type: "heist_setup", heist: "merryweather-heist", approach: "Offshore" },
  { title: "The Merryweather Heist", p: "MFT", giver: "Trevor Philips", type: "heist", heist: "merryweather-heist" },
  { title: "Trash Truck", p: "MFT", giver: "Michael De Santa", type: "heist_setup", heist: "blitz-play" },
  { title: "Boiler Suits", p: "MFT", giver: "Michael De Santa", type: "heist_setup", heist: "blitz-play" },
  { title: "Masks", p: "MFT", giver: "Michael De Santa", type: "heist_setup", heist: "blitz-play" },
  { title: "Tow Truck", p: "MFT", giver: "Michael De Santa", type: "heist_setup", heist: "blitz-play" },
  { title: "Getaway Vehicle (Blitz Play)", p: "MFT", giver: "Michael De Santa", type: "heist_setup", heist: "blitz-play", slug: "getaway-vehicle-blitz-play", url: "Blitz_Play" },
  { title: "Blitz Play", p: "MFT", giver: "Steve Haines", type: "heist", heist: "blitz-play" },
  { title: "I Fought the Law", p: "MFT", giver: "Devin Weston", type: "main" },
  { title: "Eye in the Sky", p: "FT", giver: "Devin Weston", type: "main" },
  { title: "Deep Inside", p: "F", giver: "Devin Weston", type: "main" },
  { title: "Mr. Richards", p: "M", giver: "Solomon Richards", type: "main", slug: "mr-richards" },
  { title: "Hotel Assassination", p: "F", giver: "Lester Crest", type: "assassination" },
  { title: "The Multi-Target Assassination", p: "F", giver: "Lester Crest", type: "assassination" },
  { title: "The Vice Assassination", p: "F", giver: "Lester Crest", type: "assassination" },
  { title: "The Bus Assassination", p: "F", giver: "Lester Crest", type: "assassination" },
  { title: "The Construction Assassination", p: "F", giver: "Lester Crest", type: "assassination" },
  { title: "Caida Libre", p: "MT", giver: "Martin Madrazo", type: "main" },
  { title: "Minor Turbulence", p: "T", giver: "Trevor Philips", type: "main" },
  { title: "Predator", p: "MFT", giver: "Trevor Philips", type: "main" },
  { title: "Paleto Score Setup", p: "MT", giver: "Steve Haines", type: "heist_setup", heist: "paleto-score" },
  { title: "Military Hardware", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "paleto-score" },
  { title: "The Paleto Score", p: "MFT", giver: "Steve Haines", type: "heist", heist: "paleto-score" },
  { title: "Derailed", p: "MT", giver: "Trevor Philips", type: "main" },
  { title: "Monkey Business", p: "MT", giver: "Steve Haines", type: "main" },
  { title: "Hang Ten", p: "T", giver: "Trevor Philips", type: "main" },
  { title: "Surveying the Score", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score" },
  { title: "Bury the Hatchet", p: "MT", giver: "Michael De Santa", type: "main", spoiler: 2 },
  { title: "Pack Man", p: "FT", giver: "Lamar Davis", type: "main" },
  { title: "Fresh Meat", p: "MF", giver: "Franklin Clinton", type: "main" },
  { title: "The Ballad of Rocco", p: "M", giver: "Solomon Richards", type: "main" },
  { title: "Legal Trouble", p: "M", giver: "Solomon Richards", type: "main" },
  { title: "Cleaning Out the Bureau", p: "M", giver: "Steve Haines", type: "heist_setup", heist: "bureau-raid" },
  { title: "Architect's Plans", p: "F", giver: "Lester Crest", type: "heist_setup", heist: "bureau-raid" },
  { title: "Fire Truck", p: "MF", giver: "Lester Crest", type: "heist_setup", heist: "bureau-raid", approach: "Fire Crew" },
  { title: "Getaway Vehicle (Bureau Raid)", p: "MF", giver: "Lester Crest", type: "heist_setup", heist: "bureau-raid", slug: "getaway-vehicle-bureau-raid", url: "The_Bureau_Raid" },
  { title: "The Bureau Raid", p: "MF", giver: "Steve Haines", type: "heist", heist: "bureau-raid" },
  { title: "The Wrap Up", p: "MT", giver: "Dave Norton", type: "main", spoiler: 2 },
  { title: "Reuniting the Family", p: "M", giver: "Michael De Santa", type: "main", spoiler: 2 },
  { title: "Lamar Down", p: "MFT", giver: "Tanisha Jackson", type: "main", spoiler: 2 },
  { title: "Meltdown", p: "M", giver: "Solomon Richards", type: "main", spoiler: 2 },
  { title: "Planning the Big Score", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score" },
  { title: "Stingers", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score", approach: "Subtle" },
  { title: "Gauntlet", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score", approach: "Subtle" },
  { title: "Driller", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score", approach: "Obvious" },
  { title: "Sidetracked", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score", approach: "Obvious" },
  { title: "Getaway Vehicle (Big Score)", p: "MFT", giver: "Lester Crest", type: "heist_setup", heist: "big-score", slug: "getaway-vehicle-big-score", url: "The_Big_Score" },
  { title: "The Big Score", p: "MFT", giver: "Lester Crest", type: "heist_finale", heist: "big-score", spoiler: 2 },
  { title: "Something Sensible", p: "F", giver: "Steve Haines", type: "ending", spoiler: 3 },
  { title: "The Time's Come", p: "F", giver: "Devin Weston", type: "ending", spoiler: 3 },
  { title: "The Third Way", p: "MFT", giver: "Lester Crest", type: "ending", spoiler: 3 },
];

/** Hand-written, higher-confidence detail for selected missions (English; the LLM translates). */
const DETAIL: Record<string, { summary?: string; attrs?: Record<string, unknown>; sections?: { kind: string; title: string; text: string }[]; verification?: "verified" | "curated"; extraRelations?: { predicate: string; to: string }[] }> = {
  prologue: {
    summary: "The opening mission of GTA V: a 2004 bank robbery in North Yankton in which Michael and Trevor take part, and which ends with Michael apparently being killed. It plays as a tutorial for shooting, cover and driving.",
    attrs: { location_hint: "North Yankton", unlock_requirement: "Automatic: first mission of a new game", missable: false, counts_for_completion: true },
    sections: [{ kind: "walkthrough", title: "Overview", text: "You control Michael and Trevor during a bank robbery in North Yankton and the police chase that follows. The mission is linear and works as a tutorial; there is nothing to prepare, and the game continues directly into Franklin's story afterwards." }],
  },
  "franklin-and-lamar": {
    summary: "Franklin's first playable mission after the Prologue: Franklin and Lamar repossess a car for Simeon Yetarian's dealership, Premium Deluxe Motorsport, in South Los Santos.",
    attrs: { unlock_requirement: "Automatic after the Prologue", missable: false },
  },
  "casing-the-jewel-store": {
    summary: "Shared first setup for The Jewel Store Job: Michael scouts the Vangelico jewellery store with Lester's help. It must be done before choosing the Smart or Loud approach.",
    attrs: { location_hint: "Vangelico, Rockford Plaza, Rockford Hills" },
  },
  "carbine-rifles": {
    summary: "Setup for the LOUD approach of The Jewel Store Job: Michael obtains the weapons needed for a direct assault on the store.",
    attrs: { approach: "Loud" },
  },
  "bugstars-equipment": {
    summary: "Setup for the SMART approach of The Jewel Store Job: Michael gets the disguise and gear for a stealthy entry.",
    attrs: { approach: "Smart" },
  },
  "bz-gas-grenades": {
    summary: "Setup for the SMART approach of The Jewel Store Job: Michael steals BZ gas grenades used to knock out the people inside the store.",
    attrs: { approach: "Smart" },
  },
  "the-jewel-store-job": {
    summary: "Michael and Franklin rob the Vangelico jewellery store with Lester planning the job. It is the first heist and the player chooses between the Smart and Loud approaches.",
    attrs: { location_hint: "Vangelico, Rockford Plaza, Rockford Hills", unlock_requirement: "Complete Casing the Jewel Store and the setup missions of the chosen approach", missable: false, counts_for_completion: true },
    sections: [
      { kind: "requirements", title: "How it unlocks", text: "Do Casing the Jewel Store, then complete the setup missions of the approach you want: Carbine Rifles for the Loud approach, or Bugstars Equipment and BZ Gas Grenades for the Smart approach. Once the setups are done, Lester's heist board lets you start the heist." },
      { kind: "strategy", title: "Choosing an approach", text: "Smart is the stealthy gas-based entry (BZ gas grenades + disguises); Loud is the direct armed assault. Hired crew members cost a cut but reduce failures; cheaper crew may make mistakes that reduce the take. Exact take figures are not yet validated in the knowledge base." },
    ],
  },
  "blitz-play": {
    summary: "Michael, Franklin and Trevor ambush a Securicar carrying bonds and hold off the LSPD response. A Trashmaster blocks the street and a tow truck is used on the armoured vehicle. Steve Haines is the mission giver.",
    verification: "curated",
    attrs: { location_hint: "Los Santos streets", unlock_requirement: "After The Merryweather Heist, complete the setup missions Trash Truck, Boiler Suits, Masks, Tow Truck and Getaway Vehicle (Blitz Play)", missable: false, counts_for_completion: true },
    sections: [{ kind: "requirements", title: "How it unlocks", text: "Finish The Merryweather Heist, then complete the five setup missions given by Michael: Trash Truck, Boiler Suits, Masks, Tow Truck and Getaway Vehicle (Blitz Play). After that Steve Haines' Blitz Play heist can be started." }],
  },
  "the-merryweather-heist": {
    summary: "Trevor leads Michael and Franklin in stealing an experimental device from Merryweather Security at the Port of Los Santos. Setup missions are Scouting the Port, Minisub and Cargobob (the latter belongs to the Offshore approach).",
    attrs: { location_hint: "Port of Los Santos, Elysian Island" },
    sections: [{ kind: "note", title: "Take", text: "This heist does not pay out a cut of money in the way the others do; the device is handed over under the story. Detailed payout data is not validated here." }],
  },
  "the-paleto-score": {
    summary: "Michael, Franklin and Trevor rob the Blaine County Savings Bank in Paleto Bay, then fight police and military forces during the escape.",
    attrs: { location_hint: "Paleto Bay, Blaine County" },
  },
  "the-bureau-raid": {
    summary: "Michael and Franklin infiltrate the FIB building to erase incriminating evidence. One of its approaches is the Fire Crew approach (Fire Truck setup); the others are not yet validated here.",
    attrs: { location_hint: "FIB Building, Downtown Los Santos" },
  },
  "the-big-score": {
    summary: "The final heist: the crew robs the Union Depository using either the Subtle or the Obvious plan chosen with Lester during Planning the Big Score. Strongly tied to the game's ending.",
    attrs: { location_hint: "Union Depository, Los Santos", unlock_requirement: "Complete Planning the Big Score, the setups of the chosen approach, and Getaway Vehicle (Big Score)", missable: false, counts_for_completion: true },
    sections: [
      { kind: "strategy", title: "Subtle vs Obvious", text: "Subtle prepares with Stingers and Gauntlet; Obvious prepares with Driller and Sidetracked. Both share Planning the Big Score and Getaway Vehicle (Big Score). Compare crew skill versus cut when hiring: better crew take a bigger share but make fewer mistakes. Exact payout figures are not yet validated in the knowledge base." },
    ],
  },
  "something-sensible": {
    summary: "Ending A of the game: Franklin follows Steve Haines and Dave Norton's plan, which results in Trevor's death. Spoiler.",
    attrs: { ending_letter: "A", kills: "Trevor" },
  },
  "the-times-come": {
    summary: "Ending B of the game: Franklin follows Devin Weston's plan, which results in Michael's death. Spoiler.",
    attrs: { ending_letter: "B", kills: "Michael" },
  },
  "the-third-way": {
    summary: "Ending C of the game ('Deathwish'): the three protagonists team up against their enemies and all survive. It is the only ending that keeps all three protagonists alive. Spoiler.",
    attrs: { ending_letter: "C", kills: "none of the protagonists" },
  },
};

const MTYPE_LABEL: Record<MType, string> = {
  prologue: "prologue mission", main: "main story mission", heist: "heist", heist_setup: "heist setup mission",
  heist_finale: "heist (finale)", assassination: "Lester assassination mission", ending: "ending mission",
};

function slugOf(r: Row): string {
  if (r.slug) return r.slug;
  return r.title.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function pageOf(r: Row): string {
  return r.url ?? r.title.replace(/ /g, "_").replace(/\?/g, "%3F");
}

// Pages whose title needs a disambiguator on Grand Theft Wiki.
const PAGE_OVERRIDE: Record<string, string> = {
  chop: "Chop_(mission)", "fame-or-shame": "Fame_or_Shame_(mission)", "tow-truck": "Tow_Truck_(mission)", "fire-truck": "Fire_Truck_(mission)",
  "carbine-rifles": "Carbine_Rifles_(mission)", cargobob: "Cargobob_(mission)", predator: "Predator_(mission)", gauntlet: "Gauntlet_(mission)",
  "father-son": "Father/Son", "did-somebody-say-yoga": "Did_Somebody_Say_Yoga%3F",
};
const RETRIEVED = "2026-10-06";
type Sec = { kind: string; title: string; text: string; status?: "verified" | "curated" | "unverified" };

function detailSections(md: MissionDetail): Sec[] {
  const out: Sec[] = [];
  if (md.summary) out.push({ kind: "objectives", title: "Objective in one line", text: md.summary, status: "curated" });
  if (md.loc) out.push({ kind: "location", title: "Where it takes place", text: `Location per Grand Theft Wiki: ${md.loc}.`, status: "curated" });
  if (md.unlock || md.unlocks) out.push({ kind: "requirements", title: "Unlock chain (as stated by one wiki page)", text: `${md.unlock ? `Unlocked by: ${md.unlock}. ` : ""}${md.unlocks ? `It leads to: ${md.unlocks}. ` : ""}Wiki pages disagree on some unlock chains, so treat this as unconfirmed.${md.note ? ` ${md.note}` : ""}`, status: "unverified" });
  if (md.gold?.length) out.push({ kind: "gold", title: "Gold Medal objectives", text: `Gold Medal objectives listed: ${md.gold.join("; ")}.`, status: "curated" });
  if (md.fail) out.push({ kind: "failure", title: "Failure conditions", text: `Fails if: ${md.fail}.`, status: "curated" });
  // Walkthrough in the objective → action → location → condition shape. Only what the source page states.
  const cond = md.fail ? ` Condition: the mission fails if ${md.fail}.` : "";
  if (md.steps?.length) {
    md.steps.forEach((st, i) => out.push({ kind: "walkthrough", title: `Step ${i + 1}`, text: `Step ${i + 1}: ${st}${i === 0 && md.loc ? ` Location: ${md.loc}.` : ""}${i === md.steps!.length - 1 ? cond : ""}`, status: md.conflict ? "unverified" : "curated" }));
  } else if (md.summary) {
    out.push({ kind: "walkthrough", title: "Walkthrough (derived from the source page)", text: `Objective: ${md.summary}${md.loc ? ` Location: ${md.loc}.` : ""}${md.gold?.length ? ` Optional gold-medal goals: ${md.gold.join("; ")}.` : ""}${cond} This is the outline the mission page supports, not a complete step-by-step guide.`, status: "curated" });
  }
  if (md.conflict) {
    const c = md.conflict;
    out.push({ kind: "conflict", title: "Sources disagree", text: `Source A: ${c.a}. Source B: ${c.b}. Difference: ${c.difference}. Confidence in either version: ${Math.round(c.confidence * 100)}%. The sources diverge, so treat these details as unconfirmed.`, status: "unverified" });
  }
  const a = md.assassination;
  if (a) {
    out.push({ kind: "assassination", title: "FACT — contract details", text: `Target: ${a.target}. ${a.reward ? `Reward listed: ${a.reward}. ` : ""}${a.implication ? `Story implication: ${a.implication}` : ""}`.trim(), status: "curated" });
    if (a.stock) out.push({ kind: "money", title: "STRATEGY (community guide, not a game rule) — stocks to buy and sell", text: `STRATEGY: ${a.stock} This is a money-making strategy documented by guides, not an official game mechanic; timing and returns vary by version.`, status: a.stockStatus ?? "curated" });
    out.push({ kind: "risks", title: "Risks", text: "Risks: stock behaviour differs between versions and some players report returns far below those quoted; GTABase advises separate save slots before each contract and investment, and doing the later contracts after the main story. If the mission is failed or the timing is missed the stock effect may not happen.", status: "curated" });
  }
  return out;
}

const out = ROWS.map((r, i) => {
  const slug = slugOf(r);
  const names = [...r.p].map((c) => NAMES[c as P]);
  const detail = DETAIL[slug];
  const mtype: MType = r.type;
  const page = `https://gta.fandom.com/wiki/${pageOf(r)}`;
  const baseSummary = `${r.title} is a ${MTYPE_LABEL[mtype]} in GTA V Story Mode, played as ${names.join(", ")}${r.giver ? `, given by ${r.giver}` : ""}. It is mission #${i + 1} in the story order listed by Grand Theft Wiki.`;
  const md = DETAILS[slug];
  const sections: Sec[] = [...(detail?.sections ?? []), ...(md ? detailSections(md) : [])];
  const rel: { predicate: string; to: string }[] = [];
  // involves (protagonists) — expressed from the mission side
  for (const c of r.p) rel.push({ predicate: "involves", to: CHAR_ID[c as P] });
  if (r.giver && GIVER_ID[r.giver]) rel.push({ predicate: "given_by", to: GIVER_ID[r.giver]! });
  if (r.heist && !(r.type === "heist" || r.type === "heist_finale")) rel.push({ predicate: "setup_for", to: `heist:${r.heist}` });
  if (r.heist && (r.type === "heist" || r.type === "heist_finale")) rel.push({ predicate: "part_of", to: `heist:${r.heist}` });
  for (const x of detail?.extraRelations ?? []) rel.push(x);
  if (md?.lid) rel.push({ predicate: "takes_place_at", to: md.lid });
  const wikiPage = `https://www.grandtheftwiki.com/${PAGE_OVERRIDE[slug] ?? pageOf(r)}`;
  return {
    id: `mission:${slug}`,
    type: "mission",
    name: r.title,
    aliases: r.aliases ?? [],
    summary: detail?.summary ?? baseSummary,
    story_mode: true,
    online_only: false,
    spoiler_level: r.spoiler ?? 0,
    versions: [],
    verification: detail?.verification === "verified" ? "verified" : "curated",
    confidence: detail?.verification === "verified" ? 0.92 : 0.85,
    sources: [
      ...(md ? [md.g5w ? { source: "gta5wiki", url: `https://gta5wiki.com/missions/story/${md.g5w}/`, confidence: 0.55, retrieved_at: RETRIEVED } : { source: "grandtheftwiki", url: wikiPage, confidence: 0.75, retrieved_at: RETRIEVED }] : []),
      { source: "grandtheftwiki", url: LIST_PAGE, confidence: 0.9, retrieved_at: RETRIEVED },
      { source: "gta-wiki", url: page, confidence: 0.8 },
      ...(md?.assassination ? [{ source: "gtabase", url: "https://gtabase.com/grand-theft-auto-v/side-missions/gta-5-lester-s-assassinations-guide-how-to-make-2-billion-with-stock-market", confidence: 0.7, retrieved_at: RETRIEVED }] : []),
    ],
    attrs: {
      mission_type: mtype,
      protagonists: names,
      giver: r.giver ?? null,
      sequence: i + 1,
      ...(r.approach ? { approach: r.approach } : {}),
      money_reward: md?.assassination?.reward ?? "not validated yet (not listed on the source page)",
      ...(md?.loc ? { location_text: md.loc } : {}),
      ...(detail?.attrs ?? {}),
    },
    sections,
    relations: rel,
  };
});

// strip null givers (zod attrs accept null, but keep JSON tidy)
for (const m of out) if (m.attrs.giver === null) delete (m.attrs as Record<string, unknown>).giver;

const file = path.join(process.cwd(), "data", "kb", "entities-missions.json");
fs.writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
console.log(`wrote ${out.length} missions → ${path.relative(process.cwd(), file)}`);
