/**
 * Generates the hand-curated parts of the knowledge base (everything except missions).
 *
 * Provenance policy (see README → Knowledge Architecture):
 *  - `verified`  : cross-checked against a reachable source at curation time (2026-10-06).
 *  - `curated`   : written from domain knowledge and attributed to the page that covers the topic;
 *                  NOT machine-verified. Shown in the UI as "curated".
 *  - Anything we could not validate is NOT invented — it goes to data/kb/backlog.json and the agent
 *    answers "not validated yet".
 *
 * Usage: npx tsx scripts/dev/build-kb.ts
 */
import fs from "node:fs";
import path from "node:path";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
interface Ent {
  id: string;
  type: string;
  name: string;
  aliases?: string[];
  summary: string;
  story_mode?: boolean;
  online_only?: boolean;
  spoiler_level?: number;
  versions?: string[];
  verification?: "verified" | "curated" | "unverified";
  confidence?: number;
  sources: { source: string; url: string; confidence?: number; retrieved_at?: string }[];
  attrs?: Record<string, Json>;
  sections?: { kind: string; title: string; text: string; status?: "verified" | "curated" | "unverified"; src?: number }[];
  relations?: { predicate: string; to: string }[];
  location?: { region?: string; district?: string; game_x?: number; game_y?: number; game_z?: number; coord_precision?: string; external_map_url?: string };
}

const gw = (page: string, confidence = 0.85) => ({ source: "gta-wiki", url: `https://gta.fandom.com/wiki/${page}`, confidence });
const gtw = (page: string, confidence = 0.9) => ({ source: "grandtheftwiki", url: `https://www.grandtheftwiki.com/${page}`, confidence, retrieved_at: "2026-10-06" });
const rs = (url: string, source: "rockstar" | "rockstar-support" = "rockstar", confidence = 0.9) => ({ source, url, confidence });
const IGN_MAP = "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More";

const OUT = path.join(process.cwd(), "data", "kb");
const write = (name: string, data: unknown) => {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${(data as unknown[]).length} → data/kb/${name}`);
};

/* ───────────────────────────── characters ───────────────────────────── */
const characters: Ent[] = [
  {
    id: "character:michael-de-santa", type: "character", name: "Michael De Santa", aliases: ["Michael", "Mike", "Michael Townley", "Mikey"],
    summary: "Michael De Santa (born Michael Townley) is one of the three playable protagonists: a retired bank robber living in Rockford Hills under witness protection, with his wife Amanda and children Jimmy and Tracey.",
    sources: [gw("Michael_De_Santa")], verification: "curated",
    attrs: { role: "protagonist", playable: true, special_ability: "Slows down time while aiming during shootouts", home: "Rockford Hills", family: ["Amanda De Santa", "Jimmy De Santa", "Tracey De Santa"] },
    relations: [{ predicate: "owns", to: "location:michaels-house" }],
  },
  {
    id: "character:franklin-clinton", type: "character", name: "Franklin Clinton", aliases: ["Franklin", "Frank"],
    summary: "Franklin Clinton is a young repo man from South Los Santos who works for Simeon Yetarian's Premium Deluxe Motorsport. He is the first protagonist introduced after the Prologue and later takes Lester's assassination contracts.",
    sources: [gw("Franklin_Clinton")], verification: "curated",
    attrs: { role: "protagonist", playable: true, special_ability: "Slows down time while driving", friend: "Lamar Davis", dog: "Chop" },
    relations: [{ predicate: "owns", to: "location:franklins-strawberry-house" }],
  },
  {
    id: "character:trevor-philips", type: "character", name: "Trevor Philips", aliases: ["Trevor", "Trev"],
    summary: "Trevor Philips is a volatile criminal who runs Trevor Philips Industries from Sandy Shores in Blaine County. He is Michael's former partner and the third playable protagonist.",
    sources: [gw("Trevor_Philips")], verification: "curated", spoiler_level: 1,
    attrs: { role: "protagonist", playable: true, special_ability: "Rage: deals more damage and takes less damage for a short time", home: "Sandy Shores", associates: ["Ron Jakowski", "Wade Hebert", "Floyd Hebert"] },
    relations: [{ predicate: "owns", to: "location:trevors-trailer" }],
  },
  {
    id: "character:lester-crest", type: "character", name: "Lester Crest", aliases: ["Lester"],
    summary: "Lester Crest is the heist planner who organises Michael's, Franklin's and Trevor's major jobs and the five assassination contracts given to Franklin.",
    sources: [gw("Lester_Crest")], verification: "curated",
    attrs: { role: "heist planner and mission giver", playable: false },
  },
  {
    id: "character:lamar-davis", type: "character", name: "Lamar Davis", aliases: ["Lamar"],
    summary: "Lamar Davis is Franklin's long-time friend and partner in crime, and a mission giver early in the story. Chop, his dog, ends up with Franklin.",
    sources: [gw("Lamar_Davis")], verification: "curated", attrs: { role: "friend of Franklin, mission giver", playable: false },
  },
  { id: "character:simeon-yetarian", type: "character", name: "Simeon Yetarian", aliases: ["Simeon"], summary: "Simeon Yetarian owns Premium Deluxe Motorsport, the car dealership where Franklin works, and gives Franklin the first story missions.", sources: [gw("Simeon_Yetarian")], attrs: { role: "car dealer, mission giver", playable: false } },
  { id: "character:amanda-de-santa", type: "character", name: "Amanda De Santa", aliases: ["Amanda"], summary: "Amanda De Santa is Michael's wife.", sources: [gw("Amanda_De_Santa")], attrs: { role: "Michael's wife", playable: false } },
  { id: "character:jimmy-de-santa", type: "character", name: "Jimmy De Santa", aliases: ["Jimmy"], summary: "Jimmy De Santa is Michael and Amanda's son.", sources: [gw("Jimmy_De_Santa")], attrs: { role: "Michael's son", playable: false } },
  { id: "character:tracey-de-santa", type: "character", name: "Tracey De Santa", aliases: ["Tracey"], summary: "Tracey De Santa is Michael and Amanda's daughter.", sources: [gw("Tracey_De_Santa")], attrs: { role: "Michael's daughter", playable: false } },
  { id: "character:dave-norton", type: "character", name: "Dave Norton", aliases: ["Dave", "Agent Norton"], summary: "Dave Norton is an FIB agent who becomes involved with Michael and later pressures him into jobs.", sources: [gw("Dave_Norton")], spoiler_level: 1, attrs: { role: "FIB agent, mission giver", playable: false } },
  { id: "character:steve-haines", type: "character", name: "Steve Haines", aliases: ["Steve", "Agent Haines"], summary: "Steve Haines is a corrupt FIB agent and television personality who gives Michael, Franklin and Trevor several missions including Blitz Play.", sources: [gw("Steve_Haines")], spoiler_level: 1, attrs: { role: "FIB agent, mission giver", playable: false } },
  { id: "character:devin-weston", type: "character", name: "Devin Weston", aliases: ["Devin"], summary: "Devin Weston is a billionaire businessman who gives Franklin and Trevor several missions.", sources: [gw("Devin_Weston")], spoiler_level: 1, attrs: { role: "businessman, mission giver", playable: false } },
  { id: "character:martin-madrazo", type: "character", name: "Martin Madrazo", aliases: ["Madrazo"], summary: "Martin Madrazo is a cartel boss whom Michael owes money and who gives Michael and Trevor the mission Caida Libre.", sources: [gw("Martin_Madrazo")], attrs: { role: "cartel boss, mission giver", playable: false } },
  { id: "character:solomon-richards", type: "character", name: "Solomon Richards", aliases: ["Solomon"], summary: "Solomon Richards is a movie producer who gives Michael several missions.", sources: [gw("Solomon_Richards")], attrs: { role: "film producer, mission giver", playable: false } },
  { id: "character:tanisha-jackson", type: "character", name: "Tanisha Jackson", aliases: ["Tanisha"], summary: "Tanisha Jackson is a friend of Franklin and Lamar who gives the mission Lamar Down.", sources: [gw("Tanisha_Jackson")], spoiler_level: 1, attrs: { role: "friend of Franklin, mission giver", playable: false } },
  { id: "character:ron-jakowski", type: "character", name: "Ron Jakowski", aliases: ["Ron", "Nervous Ron"], summary: "Ron Jakowski is a paranoid associate of Trevor in Sandy Shores.", sources: [gw("Ron_Jakowski")], attrs: { role: "Trevor's associate", playable: false } },
  { id: "character:wade-hebert", type: "character", name: "Wade Hebert", aliases: ["Wade"], summary: "Wade Hebert is Trevor's associate and friend.", sources: [gw("Wade_Hebert")], attrs: { role: "Trevor's associate", playable: false } },
  { id: "character:chop", type: "character", name: "Chop", aliases: ["Chop the dog", "cachorro Chop"], summary: "Chop is Lamar's Rottweiler, who becomes Franklin's dog.", sources: [gw("Chop")], attrs: { role: "dog (Franklin's companion)", playable: false } },
];

/* ───────────────────────────── locations ───────────────────────────── */
type L = { id: string; name: string; aliases?: string[]; summary: string; region: string; district?: string; x?: number; y?: number; page: string; kind: string; relations?: Ent["relations"] };
const LOCS: L[] = [
  { id: "del-perro-pier", name: "Del Perro Pier", aliases: ["Pier", "Del Perro", "pier de Del Perro", "roda-gigante", "ferris wheel"], summary: "The famous pier at Del Perro Beach in western Los Santos, with a ferris wheel and a roller coaster. A defining landmark of the city.", region: "Los Santos", district: "Del Perro Beach", x: -1850, y: -1235, page: "Del_Perro_Pier", kind: "landmark" },
  { id: "vangelico-jewelry-store", name: "Vangelico Jewelry Store", aliases: ["Vangelico", "jewelry store", "Vangelico store", "loja Vangelico"], summary: "The Vangelico jewellery store at Rockford Plaza in Rockford Hills, target of The Jewel Store Job.", region: "Los Santos", district: "Rockford Hills", x: -622, y: -232, page: "Vangelico", kind: "heist target", relations: [{ predicate: "located_in", to: "location:rockford-hills" }] },
  { id: "rockford-hills", name: "Rockford Hills", aliases: ["Rockford"], summary: "An affluent district of Los Santos where Michael lives and where the Vangelico store is located.", region: "Los Santos", district: "Rockford Hills", x: -850, y: -100, page: "Rockford_Hills", kind: "district" },
  { id: "michaels-house", name: "Michael's House", aliases: ["Michael's mansion", "casa do Michael", "Michael's home"], summary: "Michael De Santa's residence in Rockford Hills, Los Santos. Michael's safehouse.", region: "Los Santos", district: "Rockford Hills", x: -813, y: 178, page: "Michael_De_Santa", kind: "residence", relations: [{ predicate: "located_in", to: "location:rockford-hills" }] },
  { id: "franklins-strawberry-house", name: "Franklin's House in Strawberry", aliases: ["Franklin's first house", "Franklin's old house", "casa do Franklin em Strawberry"], summary: "Franklin Clinton's first residence, in Strawberry, South Los Santos.", region: "Los Santos", district: "Strawberry", x: -14, y: -1442, page: "Franklin_Clinton", kind: "residence" },
  { id: "franklins-vinewood-hills-house", name: "Franklin's House in Vinewood Hills", aliases: ["Franklin's mansion", "Franklin's new house", "casa do Franklin em Vinewood Hills"], summary: "Franklin's later residence in the Vinewood Hills overlooking Los Santos.", region: "Los Santos", district: "Vinewood Hills", x: 7, y: 540, page: "Franklin_Clinton", kind: "residence" },
  { id: "trevors-trailer", name: "Trevor's Trailer", aliases: ["Trevor's home", "Sandy Shores trailer", "trailer do Trevor"], summary: "Trevor Philips' trailer in Sandy Shores, Blaine County.", region: "Blaine County", district: "Sandy Shores", x: 1975, y: 3815, page: "Trevor_Philips", kind: "residence" },
  { id: "trevor-philips-industries-hangar", name: "Trevor Philips Industries Hangar", aliases: ["TPI", "Trevor Philips Industries", "Sandy Shores Airfield hangar"], summary: "Trevor's hangar at Sandy Shores Airfield, base of Trevor Philips Industries.", region: "Blaine County", district: "Sandy Shores Airfield", x: 1745, y: 3265, page: "Trevor_Philips_Industries", kind: "base" },
  { id: "paleto-bank", name: "Blaine County Savings Bank (Paleto Bay)", aliases: ["Paleto Bank", "Paleto Bay bank", "banco de Paleto"], summary: "The bank in Paleto Bay robbed during The Paleto Score.", region: "Blaine County", district: "Paleto Bay", x: -105, y: 6470, page: "Blaine_County_Savings_Bank", kind: "heist target" },
  { id: "union-depository", name: "Union Depository", aliases: ["Union Depository vault", "depósito da Union"], summary: "The vault in Los Santos that is the target of The Big Score.", region: "Los Santos", district: "Downtown Los Santos", x: -3, y: -682, page: "Union_Depository", kind: "heist target" },
  { id: "fib-building", name: "FIB Building", aliases: ["FIB", "Bureau", "Federal Investigation Bureau"], summary: "The FIB headquarters in Downtown Los Santos, infiltrated during The Bureau Raid.", region: "Los Santos", district: "Downtown Los Santos", x: 136, y: -749, page: "FIB_Building", kind: "heist target" },
  { id: "los-santos-international-airport", name: "Los Santos International Airport", aliases: ["LSIA", "airport", "aeroporto de Los Santos"], summary: "The main airport of Los Santos, in the south-west of the city.", region: "Los Santos", district: "Los Santos International Airport", x: -1336, y: -3044, page: "Los_Santos_International_Airport", kind: "landmark" },
  { id: "port-of-los-santos", name: "Port of Los Santos", aliases: ["Port", "porto de Los Santos", "Elysian Island"], summary: "The commercial port on Elysian Island; location of the Merryweather Heist setup.", region: "Los Santos", district: "Elysian Island", x: 1100, y: -3000, page: "Port_of_Los_Santos", kind: "landmark" },
  { id: "fort-zancudo", name: "Fort Zancudo", aliases: ["Zancudo", "military base", "base militar"], summary: "A military base in north-west San Andreas. Entering it triggers a wanted level and it is where military vehicles can be found.", region: "Blaine County", district: "Fort Zancudo", x: -2047, y: 3132, page: "Fort_Zancudo", kind: "military" },
  { id: "mount-chiliad", name: "Mount Chiliad", aliases: ["Chiliad", "Monte Chiliad"], summary: "The tallest mountain in San Andreas, in northern Blaine County.", region: "Blaine County", district: "Mount Chiliad", x: 450, y: 5600, page: "Mount_Chiliad", kind: "landmark" },
  { id: "vinewood-sign", name: "Vinewood Sign", aliases: ["Vinewood letters", "letreiro de Vinewood"], summary: "The giant Vinewood sign in the hills above Los Santos.", region: "Los Santos", district: "Vinewood Hills", x: 710, y: 1204, page: "Vinewood_Sign", kind: "landmark" },
  { id: "galileo-observatory", name: "Galileo Observatory", aliases: ["Observatory", "observatório"], summary: "An observatory in the Vinewood Hills, in the hills of Los Santos.", region: "Los Santos", district: "Vinewood Hills", x: -411, y: 1172, page: "Galileo_Observatory", kind: "landmark" },
  { id: "sandy-shores", name: "Sandy Shores", aliases: ["Sandy"], summary: "A desert town on the shores of the Alamo Sea in Blaine County. Trevor's base.", region: "Blaine County", district: "Sandy Shores", x: 1850, y: 3700, page: "Sandy_Shores", kind: "town" },
  { id: "paleto-bay", name: "Paleto Bay", aliases: ["Paleto"], summary: "A small coastal town at the north end of San Andreas.", region: "Blaine County", district: "Paleto Bay", x: -150, y: 6300, page: "Paleto_Bay", kind: "town" },
  { id: "grapeseed", name: "Grapeseed", summary: "A farming town in north-central Blaine County.", region: "Blaine County", district: "Grapeseed", x: 1700, y: 4800, page: "Grapeseed", kind: "town" },
  { id: "maze-bank-tower", name: "Maze Bank Tower", aliases: ["Maze Bank", "Maze Bank Building"], summary: "The tallest skyscraper in Los Santos, in Pillbox Hill.", region: "Los Santos", district: "Pillbox Hill", x: -75, y: -819, page: "Maze_Bank_Tower", kind: "landmark" },
  { id: "humane-labs", name: "Humane Labs and Research", aliases: ["Humane Labs", "Humane"], summary: "A research facility in the east of San Andreas.", region: "Blaine County", district: "Tataviam Mountains", x: 3619, y: 3737, page: "Humane_Labs_and_Research", kind: "facility" },
];

const locations: Ent[] = LOCS.map((l) => ({
  id: `location:${l.id}`, type: "location", name: l.name, aliases: l.aliases ?? [], summary: l.summary,
  verification: "curated", confidence: 0.8,
  sources: [gw(l.page, 0.8)],
  attrs: { kind: l.kind },
  location: { region: l.region, district: l.district, game_x: l.x, game_y: l.y, coord_precision: "approximate", external_map_url: IGN_MAP },
  relations: [...(l.relations ?? []), { predicate: "located_in", to: l.region === "Los Santos" ? "location:los-santos" : "location:blaine-county" }],
}));

/* ───────────────────────────── heists ───────────────────────────── */
const heists: Ent[] = [
  {
    id: "heist:jewel-store-job", type: "heist", name: "The Jewel Store Job", aliases: ["Jewel Store Job", "Jewel Store", "Jewelry Store Job", "joalheria", "assalto à joalheria"],
    summary: "Michael's first heist with Franklin and Lester: robbing the Vangelico jewellery store. Two approaches: Smart (stealthy, BZ gas) and Loud.",
    sources: [gw("The_Jewel_Store_Job"), gtw("The_Jewel_Store_Job")], verification: "curated",
    attrs: { approaches: ["Smart", "Loud"], setup_missions: ["Casing the Jewel Store", "Carbine Rifles (Loud)", "Bugstars Equipment (Smart)", "BZ Gas Grenades (Smart)"] },
    sections: [
      { kind: "strategy", title: "Smart vs Loud", text: "Smart: complete Casing the Jewel Store, Bugstars Equipment and BZ Gas Grenades, then gas the store and enter quietly. Loud: complete Casing the Jewel Store and Carbine Rifles and go in with weapons. Crew skill and cut: better crew members take a bigger percentage but make fewer mistakes. Exact take figures and the crew roster (Gunman / Driver / Hacker names and cuts) are not validated yet in the knowledge base." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:vangelico-jewelry-store" }, { predicate: "involves", to: "character:lester-crest" }],
  },
  {
    id: "heist:merryweather-heist", type: "heist", name: "The Merryweather Heist", aliases: ["Merryweather Heist", "Merryweather", "assalto Merryweather"],
    summary: "Trevor, Michael and Franklin steal an experimental device from Merryweather Security. Setup missions: Scouting the Port, Minisub and Cargobob (Offshore approach).",
    sources: [gw("The_Merryweather_Heist"), gtw("The_Merryweather_Heist")], verification: "curated",
    attrs: { approaches: ["Offshore"] },
    sections: [{ kind: "strategy", title: "Approaches", text: "The Offshore approach uses a Cargobob (setup mission 'Cargobob') and a Minisub. The name and details of the alternative approach are not validated yet in the knowledge base." }],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:port-of-los-santos" }],
  },
  {
    id: "heist:blitz-play", type: "heist", name: "Blitz Play", aliases: ["Blitz Play heist", "ambush Securicar"],
    summary: "Michael, Franklin and Trevor ambush a Securicar carrying bonds using a Trashmaster and a tow truck, then hold off the LSPD. Given by Steve Haines after the Merryweather Heist and five setup missions.",
    sources: [gw("Blitz_Play"), gtw("Blitz_Play")], verification: "verified", confidence: 0.9,
    attrs: { approaches: [], setup_missions: ["Trash Truck", "Boiler Suits", "Masks", "Tow Truck", "Getaway Vehicle (Blitz Play)"] },
    sections: [{ kind: "requirements", title: "Unlock", text: "Finish The Merryweather Heist, then complete Trash Truck, Boiler Suits, Masks, Tow Truck and Getaway Vehicle (Blitz Play). Blitz Play has a single plan (no Subtle/Obvious choice)." }],
  },
  {
    id: "heist:paleto-score", type: "heist", name: "The Paleto Score", aliases: ["Paleto Score", "Paleto Bay bank heist", "assalto ao banco de Paleto"],
    summary: "Michael, Franklin and Trevor rob the bank in Paleto Bay and fight police and military during the escape. Setup missions: Paleto Score Setup, Military Hardware and Surveying the Score.",
    sources: [gw("The_Paleto_Score"), gtw("The_Paleto_Score")], verification: "curated",
    attrs: { approaches: [] },
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:paleto-bank" }],
  },
  {
    id: "heist:bureau-raid", type: "heist", name: "The Bureau Raid", aliases: ["Bureau Raid", "FIB raid", "invasão ao FIB"],
    summary: "Michael and Franklin raid the FIB building to destroy evidence. Setup missions include Cleaning Out the Bureau, Architect's Plans, Fire Truck (Fire Crew approach) and Getaway Vehicle (Bureau Raid).",
    sources: [gw("The_Bureau_Raid"), gtw("The_Bureau_Raid")], verification: "curated",
    attrs: { approaches: ["Fire Crew"] },
    sections: [{ kind: "strategy", title: "Approaches", text: "The Fire Crew approach uses the Fire Truck setup mission. The names and details of the other approaches are not validated yet in the knowledge base." }],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:fib-building" }],
  },
  {
    id: "heist:big-score", type: "heist", name: "The Big Score", aliases: ["Big Score", "grande golpe", "final heist", "último assalto"],
    summary: "The final heist: the Union Depository robbery, planned with Lester in Planning the Big Score. Choose the Subtle plan (Stingers, Gauntlet) or the Obvious plan (Driller, Sidetracked).",
    sources: [gw("The_Big_Score"), gtw("The_Big_Score")], verification: "curated", spoiler_level: 2,
    attrs: { approaches: ["Subtle", "Obvious"], setup_missions: ["Planning the Big Score", "Stingers (Subtle)", "Gauntlet (Subtle)", "Driller (Obvious)", "Sidetracked (Obvious)", "Getaway Vehicle (Big Score)"] },
    sections: [
      { kind: "strategy", title: "Subtle vs Obvious", text: "Both approaches share Planning the Big Score and Getaway Vehicle (Big Score). Subtle requires Stingers and Gauntlet; Obvious requires Driller and Sidetracked. Pros/cons and exact payouts are not validated yet; as a general rule, hiring better-skilled crew costs a bigger cut but reduces mistakes." },
      { kind: "money", title: "Maximising the payout", text: "The payout of every heist depends on the approach, the crew skill versus cut, and on how well you perform during the heist. Exact figures are not validated yet in the knowledge base, so no numbers are given here." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:union-depository" }],
  },
];

/* ───────────────────────────── endings ───────────────────────────── */
const endings: Ent[] = [
  { id: "ending:ending-a-something-sensible", type: "ending", name: "Ending A — Something Sensible", aliases: ["Ending A", "final A", "Kill Trevor", "matar o Trevor"], summary: "Franklin follows Steve Haines and Dave Norton's plan, resulting in Trevor's death.", sources: [gw("Something_Sensible"), gtw("Something_Sensible")], spoiler_level: 3, attrs: { choice: "Kill Trevor", mission: "Something Sensible" }, relations: [{ predicate: "requires", to: "mission:something-sensible" }] },
  { id: "ending:ending-b-the-times-come", type: "ending", name: "Ending B — The Time's Come", aliases: ["Ending B", "final B", "Kill Michael", "matar o Michael"], summary: "Franklin follows Devin Weston's plan, resulting in Michael's death.", sources: [gw("The_Time%27s_Come"), gtw("The_Time%27s_Come")], spoiler_level: 3, attrs: { choice: "Kill Michael", mission: "The Time's Come" }, relations: [{ predicate: "requires", to: "mission:the-times-come" }] },
  {
    id: "ending:ending-c-the-third-way", type: "ending", name: "Ending C — The Third Way (Deathwish)", aliases: ["Ending C", "final C", "Deathwish", "The Third Way", "terceiro final", "salvar todos"], summary: "The three protagonists unite against their enemies and all survive. It is the only ending that keeps all three protagonists alive.",
    sources: [gw("The_Third_Way"), gtw("The_Third_Way")], spoiler_level: 3, attrs: { choice: "Deathwish", mission: "The Third Way" },
    sections: [{ kind: "guidance", title: "Which ending is best?", text: "Ending C is the one that keeps all three protagonists alive, so it is the common recommendation if you want to continue with all of them. Endings A and B each result in the death of a protagonist. Treat this as guidance, not a rule: the choice is yours." }],
    relations: [{ predicate: "requires", to: "mission:the-third-way" }],
  },
];

/* ───────────────────────────── collectibles ───────────────────────────── */
const collectibles: Ent[] = [
  { id: "collectible:letter-scraps", type: "collectible", name: "Letter Scraps", aliases: ["Letter Scrap", "pedaços de carta", "cartas rasgadas"], summary: "50 pieces of trash (letter scraps) scattered across San Andreas. They relate to the Strangers and Freaks mission 'A Starlet in Vinewood', which only Franklin can complete.", sources: [gtw("Letter_Scraps")], verification: "verified", confidence: 0.85, attrs: { kind: "Letter Scraps", total: 50, related_mission: "A Starlet in Vinewood", character: "Franklin" } },
  { id: "collectible:spaceship-parts", type: "collectible", name: "Spaceship Parts", aliases: ["Spaceship Part", "peças da nave", "peças de nave espacial"], summary: "50 spaceship parts to collect around San Andreas. Collecting all of them lets you take the Space Docker.", sources: [gtw("Space_Docker")], verification: "verified", confidence: 0.85, attrs: { kind: "Spaceship Parts", total: 50, reward: "Space Docker", reward_location: "Omega's garage" }, relations: [{ predicate: "rewards", to: "vehicle:space-docker" }] },
  { id: "collectible:submarine-pieces", type: "collectible", name: "Submarine Pieces", aliases: ["Submarine Parts", "peças do submarino"], summary: "30 submarine pieces hidden underwater around San Andreas. The reward and the exact location of the submarine are not validated yet in the knowledge base.", sources: [gw("Submarine_Pieces", 0.7)], verification: "unverified", confidence: 0.6, attrs: { kind: "Submarine Pieces", total: 30 } },
  { id: "collectible:nuclear-waste", type: "collectible", name: "Nuclear Waste", aliases: ["Nuclear Waste barrels", "lixo nuclear"], summary: "30 nuclear waste barrels dumped at sea. The reward is not validated yet in the knowledge base.", sources: [gw("Nuclear_Waste", 0.7)], verification: "unverified", confidence: 0.6, attrs: { kind: "Nuclear Waste", total: 30 } },
  { id: "collectible:peyote-plants", type: "collectible", name: "Peyote Plants", aliases: ["Peyote", "Peyote Plant", "peiote", "plantas de peiote"], summary: "27 peyote plants across San Andreas, exclusive to the PS4, Xbox One and PC versions. Eating one triggers a hallucination in which you play as a random animal of the Land, Sea or Air type.", sources: [gtw("Peyote_Plants")], verification: "verified", versions: ["PS4/Xbox One", "PC", "PS5/Xbox Series"], confidence: 0.9, attrs: { kind: "Peyote Plants", total: 27, availability: "Not in the PS3/Xbox 360 versions" } },
  { id: "collectible:stunt-jumps", type: "collectible", name: "Stunt Jumps", aliases: ["Stunt Jump", "saltos acrobáticos"], summary: "50 stunt jump ramps across San Andreas.", sources: [gw("Stunt_Jumps", 0.7)], verification: "curated", confidence: 0.7, attrs: { kind: "Stunt Jumps", total: 50 } },
  { id: "collectible:knife-flights", type: "collectible", name: "Knife Flights", aliases: ["Knife Flight", "voos de faca"], summary: "15 knife flights: flying a plane through marked gaps.", sources: [gw("Knife_Flights", 0.7)], verification: "curated", confidence: 0.7, attrs: { kind: "Knife Flights", total: 15 } },
  { id: "collectible:under-the-bridge", type: "collectible", name: "Under the Bridge", aliases: ["Under the Bridge challenge", "passar por baixo das pontes"], summary: "50 bridges to fly or drive under.", sources: [gw("Under_the_Bridge", 0.7)], verification: "curated", confidence: 0.7, attrs: { kind: "Under the Bridge", total: 50 } },
];

/* ───────────────────────────── vehicles / weapons ───────────────────────────── */
const vehicles: Ent[] = [
  { id: "vehicle:space-docker", type: "vehicle", name: "Space Docker", aliases: ["Docker espacial", "nave espacial"], summary: "A special vehicle in Story Mode obtained by collecting all 50 spaceship parts. Per Grand Theft Wiki it becomes available at Omega's garage.", sources: [gw("Space_Docker"), gtw("Space_Docker")], verification: "verified", confidence: 0.8, attrs: { category: "special", story_mode_available: true, how_to_get: "Collect all 50 Spaceship Parts", location_detail: "Omega's garage (precise coordinates not validated)" }, relations: [{ predicate: "requires", to: "collectible:spaceship-parts" }] },
  { id: "vehicle:buzzard", type: "vehicle", name: "Buzzard", aliases: ["Buzzard Attack Chopper", "Nagasaki Buzzard"], summary: "A Nagasaki attack helicopter that can be spawned with the PC cheat 'buzzoff'.", sources: [gtw("Cheats_in_GTA_V")], verification: "verified", confidence: 0.85, attrs: { category: "helicopters", manufacturer: "Nagasaki", story_mode_available: true, cheat_pc: "buzzoff" } },
  { id: "vehicle:comet", type: "vehicle", name: "Comet", aliases: ["Pfister Comet"], summary: "A Pfister sports car that can be spawned with the PC cheat 'comet'.", sources: [gtw("Cheats_in_GTA_V")], verification: "verified", confidence: 0.85, attrs: { category: "cars", manufacturer: "Pfister", vehicle_class: "sports", story_mode_available: true, cheat_pc: "comet" } },
  { id: "vehicle:pcj-600", type: "vehicle", name: "PCJ-600", aliases: ["PCJ 600", "Shitzu PCJ"], summary: "A Shitzu motorcycle spawned with the PC cheat 'rocket'.", sources: [gtw("Cheats_in_GTA_V")], verification: "verified", confidence: 0.85, attrs: { category: "motorcycles", manufacturer: "Shitzu", story_mode_available: true, cheat_pc: "rocket" } },
  { id: "vehicle:sanchez", type: "vehicle", name: "Sanchez", aliases: ["Maibatsu Sanchez"], summary: "A Maibatsu off-road motorcycle spawned with the PC cheat 'offroad'.", sources: [gtw("Cheats_in_GTA_V")], verification: "verified", confidence: 0.85, attrs: { category: "motorcycles", manufacturer: "Maibatsu", story_mode_available: true, cheat_pc: "offroad" } },
];

const weapons: Ent[] = [
  { id: "weapon:catalog-overview", type: "weapon", name: "Weapons catalog (Story Mode) — overview", aliases: ["armas", "weapons", "lista de armas"], summary: "Story Mode weapons are grouped into pistols, SMGs, assault rifles, shotguns, snipers, heavy weapons, melee and throwables. Per-weapon stats, prices and locations are not validated yet in the knowledge base; weapons exclusive to GTA Online (such as the Railgun) are not part of Story Mode.", sources: [gw("Weapons_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6, attrs: { category: "overview" } },
];

/* ───────────────────────────── cheats ───────────────────────────── */
const CHEATS: [string, string, string][] = [
  ["Invincibility", "painkiller", "Makes the player invincible for about five minutes."],
  ["Health and Armor", "turtle", "Refills health and armor."],
  ["Fast Run", "catchme", "Makes the player run faster."],
  ["Fast Swim", "gotgills", "Makes the player swim faster."],
  ["Super Jump", "hoptoit", "Lets the player jump very high."],
  ["Weapons and Ammo", "toolup", "Gives weapons and ammo."],
  ["Explosive Bullets", "highex", "Bullets explode on impact."],
  ["Flaming Bullets", "incendiary", "Bullets set targets on fire."],
  ["Explosive Melee Attacks", "hothands", "Melee attacks cause explosions."],
  ["Lower Wanted Level", "lawyerup", "Reduces the wanted level."],
  ["Raise Wanted Level", "fugitive", "Raises the wanted level."],
  ["Change Weather", "makeitrain", "Cycles the weather."],
  ["Slow Motion", "slowmo", "Slows down time (can be toggled)."],
  ["Moon Gravity", "floater", "Low-gravity mode."],
  ["Drunk Mode", "liquor", "The player becomes drunk."],
  ["Spawn Buzzard", "buzzoff", "Spawns a Buzzard helicopter."],
  ["Spawn Comet", "comet", "Spawns a Comet sports car."],
  ["Spawn PCJ-600", "rocket", "Spawns a PCJ-600 motorcycle."],
  ["Spawn Sanchez", "offroad", "Spawns a Sanchez motorcycle."],
];
const PT_CHEAT: Record<string, string[]> = { Invincibility: ["invencibilidade", "invencível", "ficar invencível"], "Super Jump": ["super pulo", "pulo alto"], "Health and Armor": ["vida e armadura", "vida cheia"], "Fast Run": ["correr rápido"], "Fast Swim": ["nadar rápido"], "Weapons and Ammo": ["armas e munição"], "Lower Wanted Level": ["diminuir nível de procurado"], "Raise Wanted Level": ["aumentar nível de procurado"], "Slow Motion": ["câmera lenta"], "Moon Gravity": ["gravidade da lua"], "Drunk Mode": ["modo bêbado"] };
/** Phone numbers as quoted by GTA5Wiki (digits after 1-999). Accepted ONLY when they equal the keypad spelling of the PC code from Grand Theft Wiki. */
const PHONE_QUOTED: Record<string, string> = { Invincibility: "7246545537", "Slow Motion": "756966", "Explosive Bullets": "444439", "Weapons and Ammo": "866587", "Lower Wanted Level": "52993787", "Spawn Buzzard": "2899633", "Super Jump": "467869" };
const KEYPAD: Record<string, string> = { a: "2", b: "2", c: "2", d: "3", e: "3", f: "3", g: "4", h: "4", i: "4", j: "5", k: "5", l: "5", m: "6", n: "6", o: "6", p: "7", q: "7", r: "7", s: "7", t: "8", u: "8", v: "8", w: "9", x: "9", y: "9", z: "9" };
const keypad = (w: string) => [...w].map((c) => KEYPAD[c] ?? "").join("");
const G5W_CHEATS = { source: "gta5wiki", url: "https://gta5wiki.com/cheats/", confidence: 0.55, retrieved_at: "2026-10-06" };
const cheats: Ent[] = [
  ...CHEATS.map(([name, code, effect]): Ent => {
    const quoted = PHONE_QUOTED[name];
    const phoneOk = quoted !== undefined && quoted === keypad(code);
    const phone = phoneOk ? `1-999-${quoted}` : undefined;
    return {
    id: `cheat:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, "")}`, type: "cheat", name: `Cheat: ${name}`,
    aliases: [name, `${name} cheat`, `código ${name}`, `código ${code}`, ...(PT_CHEAT[name] ?? [])],
    summary: `${effect} PC code: ${code}.${phone ? ` Phone: ${phone}.` : ""} PlayStation and Xbox button sequences${phone ? "" : " and the phone number"} are not recorded (backlog).`,
    sources: [gtw("Cheats_in_GTA_V"), ...(phone ? [G5W_CHEATS] : [])], verification: "curated", confidence: 0.85, versions: ["PC"],
    attrs: { effect, pc_code: code, playstation: "backlog", xbox: "backlog", phone: phone ?? "backlog" },
    sections: phone ? [{ kind: "phone", title: "Phone cheat", status: "verified" as const, src: 1, text: `Phone number ${phone}. Two sources agree: GTA5Wiki quotes this number and it equals the keypad spelling of the PC code '${code}' documented by Grand Theft Wiki. Phone cheats are entered on the in-game phone.` }] : [],
    };
  }),
  {
    id: "cheat:skyfall", type: "cheat", name: "Cheat: Skyfall", aliases: ["Skyfall", "Skyfall cheat", "cair do céu"],
    summary: "Teleports the player high into the sky for a free fall. Phone: 1-999-759-3255 (single source, GTA5Wiki; consistent with the word SKYFALL on the keypad). The PC code, PlayStation and Xbox sequences are not recorded (backlog).",
    sources: [G5W_CHEATS], verification: "curated", confidence: 0.55, versions: ["PC", "PlayStation", "Xbox"],
    attrs: { effect: "Teleports the player into the sky for a free fall", phone: "1-999-759-3255", pc_code: "backlog", playstation: "backlog", xbox: "backlog" },
  },
  {
    id: "cheat:cheats-overview", type: "cheat", name: "Cheats overview", aliases: ["cheats", "códigos", "truques", "cheat codes", "how to enter cheats"],
    summary: "Cheats are separated by platform. On PC you open the console with the tilde (~) key and type the code. Console button sequences and phone numbers are not validated yet. Using cheats may have side effects and disables achievements/trophies.",
    sources: [gtw("Cheats_in_GTA_V")], verification: "verified", confidence: 0.85,
    sections: [{ kind: "warning", title: "Achievements", text: "Using any cheat may disable achievements/trophies. Never assume a cheat from one platform works on another: only the PC codes are validated in the knowledge base." }],
  },
];

/* ───────────────────────────── completion, mechanics, stocks, money, versions ───────────────────────────── */
const mechanics: Ent[] = [
  {
    id: "completion:100-percent", type: "completion", name: "100% Completion", aliases: ["100%", "100 percent", "cem por cento", "completar o jogo", "Career Criminal", "completion"],
    summary: "100% game completion in GTA V is a checklist of story missions, Strangers and Freaks, hobbies and pastimes, random events and miscellaneous activities. Do not confuse it with achievements/trophies or the Social Club checklist.",
    sources: [gw("100%25_Completion_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6,
    attrs: { story_missions: 69, strangers_and_freaks: 20, hobbies_and_pastimes: 42, random_events: 14, misc_activities: 16, counts_are_from: "community guides; percentage weights NOT validated" },
    sections: [
      { kind: "requirements", title: "What counts", text: "According to community 100% guides: 69 story missions (including the five Lester assassination contracts), 20 Strangers and Freaks missions (out of many more), 42 hobbies and pastimes, 14 random events and 16 miscellaneous activities. The exact percentage weight of each category and the exact list are not validated yet in the knowledge base." },
      { kind: "disambiguation", title: "100% is not the same as achievements", text: "The in-game completion percentage (Pause menu → Stats) is a different thing from the achievements/trophies list; the 100% completion has its own achievement/trophy called Career Criminal. The Social Club checklist is a third, separate thing. Collectibles such as Letter Scraps and Spaceship Parts are not necessarily part of the 100% checklist." },
    ],
  },
  { id: "game_mechanic:special-abilities", type: "game_mechanic", name: "Protagonist special abilities", aliases: ["special abilities", "habilidades especiais", "Rage", "special ability"], summary: "Each protagonist has a special ability: Michael slows down time while aiming in shootouts, Franklin slows down time while driving, and Trevor enters Rage, dealing more damage and taking less damage for a short time.", sources: [gw("Special_Abilities_in_GTA_V", 0.85)], verification: "curated", confidence: 0.9 },
  {
    id: "game_mechanic:heist-crew", type: "game_mechanic", name: "Heist crew system", aliases: ["crew", "equipe de assalto", "tripulação", "crew members", "hacker driver gunman"],
    summary: "Heists use hired crew (Gunman, Driver, Hacker). Better-skilled crew members take a bigger cut of the payout but make fewer mistakes; cheaper crew members take a smaller cut but may cause complications.",
    sources: [gw("Heists", 0.8)], verification: "curated", confidence: 0.8,
    sections: [{ kind: "strategy", title: "Crew choice", text: "Crew roster names, skills and cut percentages per heist are not validated yet in the knowledge base. The general trade-off is skill versus cut." }],
  },
  {
    id: "game_mechanic:mission-replay-and-gold", type: "game_mechanic", name: "Replaying missions and Gold Medal", aliases: ["replay mission", "repetir missão", "gold medal", "medalha de ouro", "Gold Medal objectives"],
    summary: "Completed missions can be replayed from the Pause menu (Replay Mission option). Missions have optional objectives for a Gold Medal. The Gold Medal objectives of each mission are not validated yet in the knowledge base.",
    sources: [gw("Missions_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6,
  },
  {
    id: "stock:stock-market", type: "stock", name: "Stock market (LCN and BAWSAQ)", aliases: ["stock market", "mercado de ações", "ações", "BAWSAQ", "LCN", "bolsa", "investir"],
    summary: "GTA V has an in-game stock market with two exchanges, LCN and BAWSAQ, that can be used from the in-game browser/phone. Prices move in response to story events and to Lester's assassination contracts, which makes it one of the best ways to make money. Specific stock tips are not validated yet.",
    sources: [gw("Stock_Market_(V)", 0.7), gtw("BAWSAQ", 0.6)], verification: "curated", confidence: 0.7,
    sections: [{ kind: "money", title: "Using it for money", text: "The main idea is to buy a stock before an event that is known to raise its price and sell afterwards. The exact companies and timing for each of Lester's assassinations are not validated yet in the knowledge base, so no tips are given here." }],
    relations: [{ predicate: "related_to", to: "character:lester-crest" }],
  },
  {
    id: "game_mechanic:money-overview", type: "game_mechanic", name: "Making money in Story Mode", aliases: ["money", "dinheiro", "ganhar dinheiro", "fazer dinheiro", "maximizar dinheiro", "after story money"],
    summary: "Story Mode money comes mainly from heist takes, the stock market, and missions and activities. Exact payouts, the best crew and the best post-story money methods are not validated yet in the knowledge base.",
    sources: [gw("Money_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6,
    sections: [{ kind: "money", title: "Known levers", text: "Heists: choose the approach and crew carefully (skill versus cut). Stock market: LCN and BAWSAQ, influenced by story events and Lester's assassination contracts. Maximising the final payout of The Big Score specifically is not validated yet." }],
    relations: [{ predicate: "related_to", to: "stock:stock-market" }, { predicate: "related_to", to: "heist:big-score" }],
  },
  {
    id: "version:editions-overview", type: "version", name: "GTA V versions and editions", aliases: ["versions", "versões", "plataformas", "PC Enhanced", "PC Legacy", "PS5", "Xbox Series", "PS4", "Xbox One", "PS3", "Xbox 360", "original", "next-gen", "enhanced edition", "diferenças entre versões"],
    summary: "GTA V was released on PS3 and Xbox 360 in 2013, on PS4 and Xbox One in 2014, on PC in 2015, on PS5 and Xbox Series in 2022, and received an Enhanced PC edition in 2025 alongside the Legacy PC edition. Not all content exists on all versions.",
    sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.8), gw("Grand_Theft_Auto_V", 0.8)], verification: "curated", confidence: 0.75,
    sections: [
      { kind: "versions", title: "Known differences", text: "Peyote Plants exist only on PS4/Xbox One/PC and later versions (not PS3/Xbox 360). First-person mode was added in the PS4/Xbox One/PC releases. Detailed per-version differences (PC Enhanced vs PC Legacy, mod compatibility, Monkey Mosaics, etc.) are not validated yet in the knowledge base." },
    ],
  },
  {
    id: "property:safehouses-overview", type: "property", name: "Safehouses and properties — overview", aliases: ["propriedades", "properties", "safehouses", "imóveis", "casas", "buy property"],
    summary: "Each protagonist has residences: Michael in Rockford Hills, Franklin in Strawberry and later Vinewood Hills, Trevor in Sandy Shores. The catalog of purchasable properties, their prices and income is not validated yet in the knowledge base.",
    sources: [gw("Properties_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6,
    relations: [{ predicate: "related_to", to: "location:michaels-house" }, { predicate: "related_to", to: "location:franklins-strawberry-house" }, { predicate: "related_to", to: "location:trevors-trailer" }],
  },
  {
    id: "hobby:hobbies-and-pastimes", type: "hobby", name: "Hobbies and Pastimes", aliases: ["hobbies", "atividades", "golf", "tennis", "darts", "triathlon", "shooting range", "yoga", "pastimes", "passatempos"],
    summary: "Optional activities such as golf, tennis, darts, triathlon, the shooting range and yoga. 42 hobbies and pastimes count towards 100% completion according to community guides; which character can do each is not validated yet.",
    sources: [gw("Hobbies_and_Pastimes", 0.7)], verification: "unverified", confidence: 0.6, attrs: { counts_for_100: true },
  },
  {
    id: "random_event:random-events-overview", type: "random_event", name: "Random Events", aliases: ["random events", "eventos aleatórios", "eventos randômicos"],
    summary: "Random events are unscripted encounters around San Andreas. 14 of them count for 100% completion according to community guides. A full list with locations, rewards and whether each can respawn is not validated yet.",
    sources: [gw("Random_Events_in_GTA_V", 0.7)], verification: "unverified", confidence: 0.6, attrs: { counts_for_100: true },
  },
  {
    id: "activity:strangers-and-freaks", type: "activity", name: "Strangers and Freaks", aliases: ["Strangers and Freaks", "estranhos e aberrações", "side missions", "missões secundárias", "S&F"],
    summary: "Optional side missions given by strangers around San Andreas. 20 of them count for 100% completion according to community guides. A full list with unlock requirements is not validated yet.",
    sources: [gw("Strangers_and_Freaks", 0.8)], verification: "unverified", confidence: 0.65, attrs: { counts_for_100: true },
  },
  {
    id: "easter_egg:mount-chiliad-mystery", type: "easter_egg", name: "Mount Chiliad Mystery", aliases: ["Chiliad mystery", "mural de Chiliad", "Mount Chiliad mural", "mistério de Mount Chiliad"],
    summary: "A well-known puzzle centred on a mural at the summit of Mount Chiliad. Details and the community's findings are not validated yet in the knowledge base.",
    sources: [gw("Mount_Chiliad_Mystery", 0.7)], verification: "unverified", confidence: 0.6,
    relations: [{ predicate: "located_at", to: "location:mount-chiliad" }],
  },
  {
    id: "troubleshooting:mission-not-appearing", type: "troubleshooting", name: "A mission does not appear or cannot be started", aliases: ["mission not appearing", "missão não aparece", "não consigo iniciar a missão", "mission not available", "missão bloqueada", "can't start mission"],
    summary: "Checklist for a mission that does not appear: check which protagonist the mission blip belongs to, finish every prerequisite mission and heist setup, check time-of-day restrictions, make sure you are not on a wanted level or another mission, and check the Strangers and Freaks requirements.",
    sources: [gw("Missions_in_GTA_V", 0.75)], verification: "curated", confidence: 0.7,
    sections: [
      { kind: "steps", title: "Gameplay checklist", text: "1) Identify the mission and its giver. 2) Check which protagonist it belongs to (the blip shows the character) and switch to them. 3) Complete the previous story missions and, for heists, every setup mission of your chosen approach. 4) Some missions only start at certain times of day. 5) Make sure you have no wanted level and no active mission. 6) For Strangers and Freaks, make sure you have reached the required story point. 7) Check your game version." },
      { kind: "technical", title: "Technical problems", text: "If the game crashes, freezes or fails to launch, that is a technical problem rather than a gameplay one: use the official Rockstar Support page for GTA V." },
    ],
  },
  {
    id: "troubleshooting:technical-pc-issues", type: "troubleshooting", name: "Technical problems (crashes, launch, installation)", aliases: ["crash", "travando", "não abre", "erro ao iniciar", "launch error", "game crashes", "technical issue", "problema técnico", "Rockstar Games Launcher"],
    summary: "Technical problems (crashes, launch failures, installation errors, the Rockstar Games Launcher) are separate from gameplay problems. The official Rockstar Support page for GTA V is the authoritative source.",
    sources: [rs("https://support.rockstargames.com/gta-v", "rockstar-support", 0.85)], verification: "curated", confidence: 0.7,
    sections: [{ kind: "steps", title: "First steps", text: "Check the official Rockstar Support page for GTA V for your platform. Typical first steps in general are verifying game files, updating graphics drivers and restarting the launcher; specific error-code solutions are not stored in this knowledge base." }],
  },
];

/* ───────────────────────────── online boundary ───────────────────────────── */
const ONLINE: [string, string, string[], string][] = [
  ["oppressor-mk2", "Oppressor Mk II", ["Oppressor", "moto voadora", "flying bike"], "A rocket-powered flying motorcycle that exists only in GTA Online."],
  ["cayo-perico-heist", "Cayo Perico Heist", ["Cayo Perico", "El Rubio"], "A GTA Online heist on the island of Cayo Perico. It is not part of Story Mode."],
  ["diamond-casino-heist", "Diamond Casino Heist", ["Diamond Casino", "Casino Heist", "Casino Diamond", "assalto ao cassino"], "A GTA Online heist and casino. It is not part of Story Mode."],
  ["doomsday-heist", "The Doomsday Heist", ["Doomsday", "Doomsday Heist"], "A GTA Online heist series. It is not part of Story Mode."],
  ["railgun", "Railgun", ["Rail gun"], "A weapon that exists only in GTA Online."],
  ["nightclub-business", "Nightclub (business)", ["Nightclub", "boate", "clube noturno"], "A GTA Online business property. It is not part of Story Mode."],
  ["arena-war", "Arena War", ["Arena Workshop", "arena"], "A GTA Online update. It is not part of Story Mode."],
  ["shark-cards", "Shark Cards and Online economy", ["Shark Card", "GTA$ Online", "GTA Online economy", "economia do Online"], "Real-money currency packs and the economy of GTA Online. Not Story Mode."],
  ["kosatka", "Kosatka submarine", ["Kosatka"], "A GTA Online submarine vehicle used for the Cayo Perico heist. It is not the submarine of Story Mode."],
  ["agency-business", "Agency (business)", ["Agency", "Franklin's agency", "Security Contracts"], "A GTA Online property with contracts. It is not part of Story Mode."],
];
const online: Ent[] = ONLINE.map(([slug, name, aliases, summary]) => ({
  id: `online_boundary:${slug}`, type: "online_boundary", name, aliases, summary: `${summary} Isso pertence ao GTA Online, não ao Modo História.`,
  story_mode: false, online_only: true, verification: "curated", confidence: 0.85,
  sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.8)],
  attrs: { scope: "GTA Online only" },
}));

/* ───────────────────────────── write ───────────────────────────── */
write("entities-characters.json", characters);
write("entities-locations.json", locations);
// Phase 2 (build-kb-2.ts) supersedes heists, collectibles, vehicles, weapons, online boundary and most mechanics.
void [heists, collectibles, vehicles, weapons, online];
write("entities-endings.json", endings);
write("entities-cheats.json", cheats.filter((c) => c.id !== "cheat:cheats-overview"));
const KEEP = new Set(["game_mechanic:special-abilities", "game_mechanic:heist-crew", "game_mechanic:mission-replay-and-gold", "easter_egg:mount-chiliad-mystery"]);
write("entities-mechanics.json", mechanics.filter((m) => KEEP.has(m.id)));

write("assets.json", [
  { id: "asset:map-san-andreas", title: "Schematic map of San Andreas (project artwork)", asset_type: "map", url: "/maps/san-andreas.svg", source: "GTA V Story AI project", license: "Original drawing by the project author: hand-placed schematic outline, not game artwork and not derived from third-party data (the GPL-3.0 coastline is a separate dataset, see DATA_LICENSES.md)", attribution: "Positions are approximate." },
  ...[
    ["michael", "character:michael-de-santa", "Michael_De_Santa"],
    ["franklin", "character:franklin-clinton", "Franklin_Clinton"],
    ["trevor", "character:trevor-philips", "Trevor_Philips"],
  ].map(([k, entity, page]) => ({ id: `asset:gallery-${k}`, title: `${k![0]!.toUpperCase()}${k!.slice(1)} — image gallery (external link)`, asset_type: "character", url: `https://gta.fandom.com/wiki/${page}`, source: "GTA Wiki", source_url: `https://gta.fandom.com/wiki/${page}`, entity_type: "character", entity_id: entity, license: "Link only — images belong to Rockstar Games / respective owners; not redistributed", attribution: "GTA Wiki contributors" })),
  { id: "asset:gallery-space-docker", title: "Space Docker — image gallery (external link)", asset_type: "vehicle", url: "https://gta.fandom.com/wiki/Space_Docker", source: "GTA Wiki", source_url: "https://gta.fandom.com/wiki/Space_Docker", entity_type: "vehicle", entity_id: "vehicle:space-docker", license: "Link only — images belong to Rockstar Games / respective owners; not redistributed", attribution: "GTA Wiki contributors" },
  { id: "asset:gallery-vangelico", title: "Vangelico — image gallery (external link)", asset_type: "location", url: "https://gta.fandom.com/wiki/Vangelico", source: "GTA Wiki", source_url: "https://gta.fandom.com/wiki/Vangelico", entity_type: "location", entity_id: "location:vangelico-jewelry-store", license: "Link only — images belong to Rockstar Games / respective owners; not redistributed", attribution: "GTA Wiki contributors" },
]);

void ([
  { topic: "Heist payouts", note: "Exact potential/final take for every approach and crew combination (Jewel Store, Paleto, Bureau Raid, Big Score)." },
  { topic: "Heist crew rosters", entity_id: "game_mechanic:heist-crew", note: "Names, skills and cut percentages of Gunmen, Drivers and Hackers per heist." },
  { topic: "Heist approaches", entity_id: "heist:merryweather-heist", note: "Alternative approach name and details for the Merryweather Heist; non-Fire-Crew approaches of the Bureau Raid." },
  { topic: "Mission walkthroughs", note: "Step-by-step walkthroughs, unlock triggers, Gold Medal objectives and missable flags for most missions. Only the mission list/order is validated." },
  { topic: "Vehicle statistics", note: "Speed/acceleration/handling/price rankings for Story Mode vehicles (e.g. 'fastest vehicle')." },
  { topic: "Weapon statistics", entity_id: "weapon:catalog-overview", note: "Damage, accuracy, range, fire rate, capacity, price and location per weapon." },
  { topic: "Console cheats", entity_id: "cheat:cheats-overview", note: "PlayStation/Xbox button sequences and phone numbers for every cheat." },
  { topic: "100% completion weights", entity_id: "completion:100-percent", note: "Percentage weight per category and the exact list of required items." },
  { topic: "Collectibles", note: "Per-item locations of Letter Scraps, Spaceship Parts, Submarine Pieces, Nuclear Waste and Peyote Plants; rewards of Submarine Pieces and Nuclear Waste." },
  { topic: "Monkey Mosaics", note: "Count, versions and reward not validated. Not documented here to avoid inventing it." },
  { topic: "Epsilon Tracts", note: "Count and versions not validated." },
  { topic: "Hidden Packages", note: "Unclear whether this collectible exists in GTA V Story Mode at all; do not answer from memory." },
  { topic: "Space Docker location", entity_id: "vehicle:space-docker", note: "Exact location/coordinates of the Space Docker and Omega's garage." },
  { topic: "Submarine location", note: "Where the submarine of Story Mode is and how it is unlocked." },
  { topic: "Stock market tips", entity_id: "stock:stock-market", note: "Which stock to buy before each of Lester's assassinations, price effects and timing." },
  { topic: "Money after the story", entity_id: "game_mechanic:money-overview", note: "Best money methods after finishing the story; property prices and income." },
  { topic: "Strangers and Freaks list", entity_id: "activity:strangers-and-freaks", note: "Full list, unlock requirements and which 20 count for 100%." },
  { topic: "Random events list", entity_id: "random_event:random-events-overview", note: "Locations, characters, rewards, uniqueness for each random event." },
  { topic: "Hobbies", entity_id: "hobby:hobbies-and-pastimes", note: "Per-activity details and character availability." },
  { topic: "Version differences", entity_id: "version:editions-overview", note: "PC Enhanced vs Legacy and per-platform content differences." },
  { topic: "Properties", entity_id: "property:safehouses-overview", note: "Purchasable properties, prices, income and locations." },
  { topic: "Coordinates", note: "All map positions are approximate (project coordinate system). Replace with verified coordinates when a licensed/verified source is ingested." },
]);
