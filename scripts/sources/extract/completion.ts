/**
 * The 100% completion checklist (Grand Theft Wiki "Completion in GTA V") as structured requirements.
 * Distinguishes "how many exist" from "how many are required" — e.g. 25 of 50 Stunt Jumps.
 */
import { articleHtml, sections, listItems, toText } from "../html";
import { page, protagonistsIn, WORD_NUMBERS, type ExtractResult } from "./common";

export interface CompletionDraft {
  id: string;
  category: "missions" | "strangers_and_freaks" | "hobbies_and_pastimes" | "random_events" | "miscellaneous" | "not_required";
  label: string;
  required_count?: number;
  total_count?: number;
  protagonists: string[];
  /** Names of the entities the requirement is about; the import step resolves them to ids. */
  target_names: string[];
  source: string;
  url: string;
  status: "verified" | "curated" | "unverified";
  notes?: string;
}

const SECTION_CATEGORY: Record<string, CompletionDraft["category"]> = {
  Missions: "missions",
  "Hobbies and pastimes": "hobbies_and_pastimes",
  Miscellaneous: "miscellaneous",
  "Non-required tasks": "not_required",
};

const num = (w: string | undefined) => (w === undefined ? undefined : /^\d+$/.test(w) ? Number(w) : WORD_NUMBERS[w.toLowerCase()]);

/** Known totals for "collect all X" lines (taken from the item lists / category entities, not invented). */
const TOTALS: Array<[RegExp, number, string]> = [
  [/spaceship parts/i, 50, "Spaceship Parts"],
  [/letter scraps/i, 50, "Letter Scraps"],
  [/under the bridge/i, 50, "Under the Bridge"],
  [/knife flights?/i, 15, "Knife Flights"],
  [/stunt jumps?/i, 50, "Stunt Jumps"],
  [/nuclear waste/i, 30, "Nuclear Waste"],
  [/submarine parts/i, 30, "Submarine Pieces"],
  [/epsilon tracts/i, 10, "Epsilon Tracts"],
  [/peyote plants/i, 27, "Peyote Plants"],
  [/monkey mosaics/i, 50, "Monkey Mosaics"],
  [/parachute jumps/i, 0, "Parachute Jumps"],
];

export function extractCompletion(): ExtractResult & { completionDrafts: CompletionDraft[] } {
  const p = page("Completion_in_GTA_V");
  const issues: string[] = [];
  const drafts: CompletionDraft[] = [];
  if (!p) return { name: "completion", entities: [], issues: ["Completion_in_GTA_V not cached"], completionDrafts: [] };
  const used = new Set<string>();
  const mkId = (base: string) => {
    let id = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    while (used.has(id)) id += "-x";
    used.add(id);
    return id;
  };

  for (const s of sections(articleHtml(p.html))) {
    const category = SECTION_CATEGORY[s.heading];
    if (!category) continue;
    const items = listItems(s.html);
    for (const raw of items) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (/^(Complete the following|Complete the remaining|Complete \d+ hobbies|Get a bronze medal or better in the following)/i.test(line)) continue;
      const d: CompletionDraft = { id: "", category, label: line, protagonists: [], target_names: [], source: "grandtheftwiki", url: p.url, status: "curated" };

      // "Barry: Grass Roots - Franklin, Grass Roots - The Pickup …" → a Strangers and Freaks block.
      const sf = line.match(/^([A-Z][^:]{1,40}):\s*(.+)$/);
      if (sf && (category === "missions" || category === "not_required")) {
        d.category = category === "missions" ? "strangers_and_freaks" : "not_required";
        d.label = `${sf[1]} — ${sf[2]}`;
        d.target_names = (sf[2] as string).replace(/\s*\((?:requires|need)[^)]*\)/gi, "").split(/,\s*|\s+and\s+/).map((x) => x.trim()).filter(Boolean);
        d.target_names.unshift(sf[1] as string);
        const cond = line.match(/\((requires|need)[^)]*\)/i)?.[0];
        if (cond) d.notes = cond.replace(/[()]/g, "");
        d.required_count = d.target_names.length - 1;
        d.id = mkId(`sf-${sf[1]}`);
        drafts.push(d);
        continue;
      }

      const outOf = line.match(/(\d+|[a-z-]+) out of the (\d+)[^)]*\)?(?: or (\d+))?/i);
      if (outOf) {
        d.required_count = num(outOf[1]);
        d.total_count = Number(outOf[3] ?? outOf[2]);
        d.notes = line.match(/\(([^)]+)\)/g)?.join(" ");
      }
      const all = line.match(/\ball (\d+|[a-z-]+)\b/i);
      const n = line.match(/^(?:Complete|Purchase)\s+(?:any\s+)?(\d+|[a-z-]+)\b/i);
      for (const [re, total, name] of TOTALS) {
        if (!re.test(line)) continue;
        d.target_names.push(name);
        if (total) d.total_count ??= total;
        if (/collect all|complete all|eat all|photograph all/i.test(line)) d.required_count ??= total || undefined;
      }
      if (n && num(n[1]) !== undefined && d.required_count === undefined) d.required_count = num(n[1]);
      if (all && num(all[1]) !== undefined) d.total_count ??= num(all[1]);
      // "Complete all three triathlons" — everything listed is required.
      if (category !== "not_required" && /^(complete|collect) all /i.test(line) && d.total_count !== undefined) d.required_count ??= d.total_count;
      if (/^(win at|play 9 holes|get a private dance|walk and play|complete a booty call|have sex|rob a store|purchase a vehicle|watch a (film|movie)|visit a|play darts)/i.test(line)) d.required_count ??= 1;
      if (/storyline missions/i.test(line)) { d.target_names.push("Missions in GTA V"); d.notes = "The 69 required story missions; the full mission list in this knowledge base has 79 entries because it also counts every setup, heist approach and ending separately."; }
      if (/assassination/i.test(line)) d.target_names.push("Lester Crest");
      if (/random events/i.test(line)) { d.category = category === "not_required" ? "not_required" : "random_events"; d.target_names.push("Random Events"); }
      d.protagonists = protagonistsIn(line);
      d.id = mkId(`${category}-${line.split(/\s+/).slice(0, 6).join("-")}`);
      drafts.push(d);
    }
  }

  // Shooting-range sub-items ("Handguns", "Shotguns"…) are short lines; fold them into one requirement.
  const shooting = drafts.filter((d) => d.category === "hobbies_and_pastimes" && /^(Handguns|Sub-machine guns|Assault rifles|Shotguns|Light machine guns|Heavy)$/i.test(d.label));
  if (shooting.length) {
    const first = drafts.indexOf(shooting[0] as CompletionDraft);
    for (const s of shooting) drafts.splice(drafts.indexOf(s), 1);
    drafts.splice(first, 0, {
      id: "hobbies-shooting-range", category: "hobbies_and_pastimes", label: `Shooting range: bronze medal or better in ${shooting.map((s) => s.label).join(", ")}`,
      required_count: shooting.length, total_count: shooting.length, protagonists: [], target_names: ["Shooting Range"], source: "grandtheftwiki", url: p.url, status: "curated",
    });
  }

  const text = toText(articleHtml(p.html));
  if (!/42 hobbies/i.test(text)) issues.push("The '42 hobbies and pastimes' line was not found — check the page");
  if (drafts.length < 30) issues.push(`Only ${drafts.length} completion requirements parsed`);

  // Enrich the existing 100% entity with the page's reward paragraph (merged, not replaced).
  const rewards = sections(articleHtml(p.html)).find((s) => s.heading === "Rewards");
  const entities: ExtractResult["entities"] = rewards ? [{
    id: "completion:100-percent", type: "completion", name: "100% Completion", summary: "100% completion checklist for GTA V Story Mode.", merge: true,
    sources: [{ source: "grandtheftwiki", url: p.url, title: p.title, retrieved_at: p.retrievedAt, confidence: 0.75 }],
    sections: [{ kind: "reward", title: "What 100% unlocks (Grand Theft Wiki)", text: toText(rewards.html), src: 0 }],
    relations: [{ predicate: "unlocks", toName: "The Last One" }],
  }] : [];
  return { name: "completion", entities, issues, completionDrafts: drafts };
}
