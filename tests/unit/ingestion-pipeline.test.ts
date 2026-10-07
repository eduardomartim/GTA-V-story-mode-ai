import { describe, expect, it } from "vitest";
import type { EntityRecord } from "@/lib/kb/schema";
import { nearestArea, runPipeline, type GazetteerArea } from "../../scripts/kb/pipeline";
import { articleHtml, infobox, lead, listItems } from "../../scripts/sources/html";
import { robotsAllows } from "../../scripts/sources/http";
import type { EntityDraft } from "../../scripts/sources/extract/common";
import { regionAreaItems } from "../../scripts/sources/extract/collectibles";
import { parseEsxConfig } from "../../scripts/sources/extract/coords-esx";

const src = { source: "grandtheftwiki", url: "https://www.grandtheftwiki.com/X", confidence: 0.75 };
const base = (over: Partial<EntityRecord> & Pick<EntityRecord, "id" | "type" | "name">): EntityRecord => ({
  aliases: [], summary: `${over.name} summary text.`, story_mode: true, online_only: false, spoiler_level: 0, versions: [], verification: "curated",
  confidence: 0.8, sources: [src], attrs: {}, sections: [], relations: [], ...over,
});
const gaz: GazetteerArea[] = [
  { name: "Sandy Shores", region: "Blaine County", x: 1850, y: 3700 },
  { name: "Paleto Bay", region: "Blaine County", x: -200, y: 6300 },
  { name: "Vinewood Hills", region: "Los Santos", x: -150, y: 1050 },
];
const item = (n: number, area: string): EntityDraft => ({
  id: `collectible_item:letter-scrap-${n}`, type: "collectible_item", name: `Letter Scrap #${n} — ${area}`, summary: `Letter Scrap in ${area}: somewhere.`,
  sources: [src], relations: [{ predicate: "instance_of", to: "collectible:letter-scraps" }, { predicate: "located_in", toName: area }],
  location: { area, coord_precision: "area" }, item: { category: "collectible:letter-scraps", kind: "Letter Scrap", number: n, area, protagonists: [] },
});
const KB = [
  base({ id: "collectible:letter-scraps", type: "collectible", name: "Letter Scraps" }),
  base({ id: "location:sandy-shores", type: "location", name: "Sandy Shores" }),
  base({ id: "character:trevor-philips", type: "character", name: "Trevor Philips" }),
  base({ id: "mission:chop", type: "mission", name: "Chop" }),
  base({ id: "online_boundary:oppressor", type: "online_boundary", name: "Oppressor Mk II", online_only: true, story_mode: false }),
];

describe("ingestion pipeline (normalize → resolve → coordinates → merge → validate)", () => {
  it("rejects records without a source and GTA Online content", () => {
    const out = runPipeline({
      base: KB, gazetteer: gaz, completion: [], onlineTerms: ["Oppressor Mk II"],
      drafts: [
        { ...item(1, "Sandy Shores"), sources: [] },
        { id: "vehicle:oppressor-mk-ii", type: "vehicle", name: "Oppressor Mk II", summary: "A flying bike.", sources: [src] },
      ],
    });
    expect(out.report.rejected.map((r) => r.reason)).toEqual(expect.arrayContaining(["no source", expect.stringMatching(/GTA Online/)]));
    expect(out.entities.some((e) => e.id === "collectible_item:letter-scrap-1")).toBe(false);
  });

  it("resolves names to existing entities, creates missing areas, and merges by name", () => {
    const out = runPipeline({
      base: KB, gazetteer: gaz, completion: [], onlineTerms: [],
      drafts: [item(1, "Sandy Shores"), item(2, "Paleto Bay"), { id: "mission:chop-mission", type: "mission", name: "Chop", summary: "The Chop mission.", sources: [{ ...src, url: "https://www.grandtheftwiki.com/Chop_(mission)" }], sections: [{ kind: "failure", title: "Fail", text: "Chop dies during the chase." }] }],
    });
    const one = out.entities.find((e) => e.id === "collectible_item:letter-scrap-1");
    expect(one?.relations).toEqual(expect.arrayContaining([{ predicate: "located_in", to: "location:sandy-shores" }]));
    const paleto = out.entities.find((e) => e.id === "location:paleto-bay");
    expect(paleto?.location?.coord_precision).toBe("approximate"); // from the gazetteer, labelled as such
    const chop = out.entities.find((e) => e.id === "mission:chop");
    expect(chop?.sections.some((s) => s.kind === "failure")).toBe(true);
    expect(out.entities.some((e) => e.id === "mission:chop-mission")).toBe(false);
  });

  it("records attribute conflicts as UNVERIFIED sections instead of overwriting", () => {
    const kb = [...KB, base({ id: "collectible:spaceship-parts", type: "collectible", name: "Spaceship Parts", attrs: { reward: "Space Docker" } })];
    const out = runPipeline({
      base: kb, gazetteer: gaz, completion: [], onlineTerms: [],
      drafts: [{ id: "collectible:spaceship-parts", type: "collectible", name: "Spaceship Parts", summary: "x", merge: true, sources: [{ ...src, url: "https://www.grandtheftwiki.com/Other" }], attrs: { reward: "A different car" } }],
    });
    const e = out.entities.find((x) => x.id === "collectible:spaceship-parts");
    expect(e?.attrs.reward).toBe("Space Docker");
    expect(e?.sections.find((s) => s.kind === "conflict")?.status).toBe("unverified");
    expect(out.report.conflicts).toHaveLength(1);
  });

  it("never upgrades knowledge status on merge", () => {
    const kb = [...KB, base({ id: "collectible:peyote-plants", type: "collectible", name: "Peyote Plants", verification: "unverified" })];
    const out = runPipeline({ base: kb, gazetteer: gaz, completion: [], onlineTerms: [], drafts: [{ id: "collectible:peyote-plants", type: "collectible", name: "Peyote Plants", summary: "x", merge: true, verification: "verified", sources: [src] }] });
    expect(out.entities.find((x) => x.id === "collectible:peyote-plants")?.verification).toBe("unverified");
  });

  it("pairs a community coordinate with a described item ONLY when both are unique in that area", () => {
    const points = [{ n: 1, x: 1860, y: 3690, z: 30 }, { n: 2, x: -150, y: 1100, z: 200 }, { n: 3, x: -120, y: 1000, z: 220 }];
    const out = runPipeline({
      base: KB, gazetteer: gaz, completion: [], onlineTerms: [],
      coords: { sets: [{ key: "LetterScraps", title: "Letter Scraps", category: "collectible:letter-scraps", points }], retrievedAt: "2026-10-06", repoUrl: "https://github.com/x/y/blob/master/config.lua" },
      drafts: [item(1, "Sandy Shores"), item(2, "Vinewood Hills"), item(3, "Vinewood Hills")],
    });
    const sandy = out.entities.find((e) => e.id === "collectible_item:letter-scrap-1");
    expect(sandy?.location?.coord_precision).toBe("community");
    expect(sandy?.location?.game_x).toBe(1860);
    // Two items + two coordinates in Vinewood Hills: ambiguous → no pairing, positions kept as labelled position-only points.
    expect(out.entities.find((e) => e.id === "collectible_item:letter-scrap-2")?.location?.game_x).toBeUndefined();
    const positions = out.entities.filter((e) => e.attrs.position_only === true);
    expect(positions).toHaveLength(2);
    expect(positions[0]?.item?.number).toBeUndefined();
    expect(out.report.coordinateLinks[0]).toMatchObject({ linked: 1, unlinked: 2, created: 2 });
  });

  it("finds the nearest named area of a coordinate", () => {
    expect(nearestArea(gaz, { x: -180, y: 6250 })?.area.name).toBe("Paleto Bay");
  });
});

describe("extractors (cached HTML → structured drafts)", () => {
  const page = `<div id="mw-content-text" class="mw-body-content"><div class="mw-parser-output"><b>Letter Scraps</b> are a collectible in Grand Theft Auto V.
    <table class="infobox"><caption>Mission</caption><tr><th scope="row">Protagonist</th><td><a href="/Trevor_Philips" title="Trevor Philips">Trevor Philips</a></td></tr>
    <tr><th scope="row">Unlocked by</th><td><a href="/Accepting_the_Truth" title="Accepting the Truth">Accepting the Truth</a></td></tr></table>
    <div class="mw-heading mw-heading2"><h2>Letter Scraps</h2></div>
    <div class="mw-heading mw-heading3"><h3>Los Santos</h3></div>
    <dl><dt><a href="/Alta" title="Alta">Alta</a></dt></dl><ul><li>Located in a ditch.</li></ul>
    <dl><dt>La Puerta</dt></dl><ul><li>Two under Calais Ave.</li><li>Located near a canal (<small>Land</small>).</li></ul>
    <div class="mw-heading mw-heading2"><h2>Video</h2></div><ul><li>not an item</li></ul>
    <table class="navbox"><tr><td>v e</td></tr></table></div></div><div class="printfooter"></div>`;

  it("walks region → area → item lists and stops at the next section", () => {
    const items = regionAreaItems(articleHtml(page));
    expect(items.map((i) => [i.region, i.area])).toEqual([["Los Santos", "Alta"], ["Los Santos", "La Puerta"], ["Los Santos", "La Puerta"]]);
    expect(items[2]?.tag).toBe("Land");
  });

  it("reads infobox fields with their links, the lead sentence, and nested list items separately", () => {
    const box = infobox(page);
    expect(box.caption).toBe("Mission");
    expect(box.fields["Unlocked by"]?.links).toEqual(["Accepting the Truth"]);
    expect(lead(articleHtml(page))).toMatch(/^Letter Scraps are a collectible/);
    expect(listItems("<ul><li>Parent<ul><li>Child A</li><li>Child B</li></ul></li></ul>")).toEqual(["Parent", "Child A", "Child B"]);
    expect(articleHtml(page)).not.toContain("navbox");
  });

  it("parses community coordinates (esx_collectables config.lua)", () => {
    const lua = `Config.Collectables = {\n    LetterScraps = {\n        Title = "Letter Scraps",\n        Items = {\n            { ID=1, Pos = vector3(1469.5,6552,15) },\n            { ID=2, Pos = vector3(-1.5,-2.25,-30) }\n        }\n    },\n    Unknown = {\n        Items = { { ID=1, Pos = vector3(1,2,3) } }\n    }\n}`;
    const sets = parseEsxConfig(lua);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ category: "collectible:letter-scraps", points: [{ n: 1, x: 1469.5, y: 6552, z: 15 }, { n: 2, x: -1.5, y: -2.25, z: -30 }] });
  });

  it("obeys robots.txt (longest match wins; Allow wins ties)", () => {
    const rules = { allow: ["/index.php?title="], disallow: ["/api.php", "/index.php?", "/*action=edit"] };
    expect(robotsAllows(rules, "/api.php?action=query")).toBe(false);
    expect(robotsAllows(rules, "/index.php?title=Letter_Scraps")).toBe(true);
    expect(robotsAllows(rules, "/index.php?search=x")).toBe(false);
    expect(robotsAllows(rules, "/Letter_Scraps")).toBe(true);
    expect(robotsAllows(rules, "/Foo?action=edit")).toBe(false);
  });
});

describe("Story Mode isolation at sentence level", () => {
  it("drops sentences about GTA Online but keeps contrastive Story Mode sentences", async () => {
    const { stripOnlineSentences } = await import("../../scripts/kb/pipeline");
    const r = stripOnlineSentences("The airfield is in Blaine County. In GTA Online it hosts a hangar you can buy. It is reachable by Scuba diving in Story Mode, or by Submersible in GTA Online.");
    expect(r.removed).toBe(1);
    expect(r.text).not.toMatch(/hangar you can buy/);
    expect(r.text).toMatch(/in Story Mode, or by Submersible/);
  });
});

describe("entity resolution name variants", () => {
  it("strips game/role qualifiers and normalises connectors", async () => {
    const { nameVariants } = await import("../../scripts/kb/pipeline");
    expect(nameVariants("Prologue (GTA V)")).toContain("Prologue");
    expect(nameVariants("By the Book (Boss))")).toContain("By the Book");
    expect(nameVariants("Paleto Score")).toContain("The Paleto Score");
    expect(nameVariants("Humane Labs & Research")).toContain("Humane Labs and Research");
  });
});
