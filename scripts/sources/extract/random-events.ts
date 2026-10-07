/** Random Events (Grand Theft Wiki "Random Events" table): name · location · protagonists · description · reward. */
import { articleHtml, toText } from "../html";
import { clip, gtwRef, idFor, page, PROTAGONISTS, protagonistsIn, type EntityDraft, type ExtractResult } from "./common";

/** Last linked place in the location cell is the most specific named area ("Smoke Tree Rd in the Grand Senora Desert"). */
function areaOf(cellHtml: string): string | undefined {
  const links = [...cellHtml.matchAll(/<a [^>]*title="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map((m) => (m[1] as string).replace(/ \(page does not exist\)$/, ""));
  const areas = links.filter((l) => !/( (St|Ave|Rd|Blvd|Dr|Way|Pkwy|Ln|Fwy|Hwy)$|Route \d+)/.test(l));
  return (areas.at(-1) ?? links.at(-1))?.replace(/ in GTA V$/, "");
}

export function extractRandomEvents(): ExtractResult {
  const p = page("Random_Events");
  if (!p) return { name: "random-events", entities: [], issues: ["Random_Events not cached"] };
  const issues: string[] = [];
  const entities: EntityDraft[] = [];
  const article = articleHtml(p.html);
  const table = article.match(/<table class="wikitable">([\s\S]*?)<\/table>/)?.[1] ?? "";
  const rows = [...table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => [...(r[1] as string).matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) => c[1] as string)).filter((r) => r.length >= 5);
  const intro = toText(article).slice(0, 1200);
  const seen = new Set<string>();
  for (const [nameH, locH, whoH, descH, rewardH] of rows as string[][]) {
    const name = toText(nameH ?? "");
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const location = toText(locH ?? "");
    const who = toText(whoH ?? "");
    const description = toText(descH ?? "");
    const reward = toText(rewardH ?? "");
    const area = areaOf(locH ?? "");
    const protagonists = protagonistsIn(who);
    const id = idFor("random_event", name);
    entities.push({
      id, type: "random_event", name,
      aliases: /^Random Event - /.test(name) ? [name.replace(/^Random Event - /, "")] : [],
      summary: clip(`Random event at ${location}. Available for: ${who}. ${description}`, 700),
      verification: "curated", confidence: 0.75,
      sources: [gtwRef(p, `${name} — ${location} — ${who} — reward: ${reward}`)],
      attrs: { location, available_for: who, reward, counts_toward_100: "any 14 random events are required for 100%", repeatable: "not stated per event (the page notes most recur if ignored; some are once only)" },
      sections: [
        { kind: "details", title: "What happens", text: description.length >= 10 ? description : `${name}: ${description || "no description on the source page"}.` },
        { kind: "reward", title: "Reward", text: `Reward listed by Grand Theft Wiki: ${reward || "not stated"}.` },
      ],
      relations: [
        ...protagonists.map((pn) => ({ predicate: "available_to" as const, to: PROTAGONISTS[pn as keyof typeof PROTAGONISTS] })),
        ...(area ? [{ predicate: "located_in" as const, toName: area }] : []),
        { predicate: "contributes_to" as const, to: "completion:100-percent", props: { rule: "any 14 of the random events" } },
      ],
      location: area ? { area, coord_precision: "area" } : undefined,
    });
  }
  const m = intro.match(/(\w+(?:[- ]\w+)?) random events appear in the original release/i);
  issues.push(`parsed ${entities.length} random events (page intro: "${m?.[0] ?? "count not found"}", plus three added in PS4/Xbox One/PC)`);
  if (entities.length < 50) issues.push("fewer than 50 random events parsed — table layout may have changed");
  return { name: "random-events", entities, issues };
}
