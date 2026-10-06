/**
 * Phase-2 knowledge, part 2: completion, strangers & freaks, hobbies, properties, random events, money/stock strategy,
 * versions, cheats overview, troubleshooting, extra locations/characters, and the knowledge backlog.
 * Same status policy as build-kb-2.ts (verified ≥2 sites · curated 1 site/author knowledge · unverified conflicting/weak).
 */
import { type Ent, GB_100, GB_BIG, GB_STOCK, IGN_MAP, g5w, gb, gi, gp, gtw, gw, rs, write } from "./data/helpers";

const GP_SF = gp("strangers-and-freaks-missions-1/z18d1d", 0.6);
const GP_RE = gp("random-events-1/z28d1e", 0.6);
const GP_PM = gp("property-missions-1/z38d1f", 0.6);
const GP_APPENDIX = gp("appendix/z08d1c", 0.6);
const GTW_SF = gtw("Strangers_and_Freaks", 0.65);

/* ───────────────────────────── 100% completion ───────────────────────────── */
const completion: Ent[] = [
  {
    id: "completion:100-percent", type: "completion", name: "100% Completion", aliases: ["100%", "100 percent", "cem por cento", "completar o jogo", "Career Criminal", "completion", "porcentagem de conclusão"],
    summary: "100% game completion is a checklist: 69 story missions, 20 Strangers and Freaks missions, 42 hobbies and pastimes, 14 random events and 16 miscellaneous activities (several sources agree on these counts). It is separate from achievements/trophies and from the Social Club.",
    sources: [gb(GB_100, 0.7), GP_APPENDIX, gw("100%25_Completion_in_GTA_V", 0.6)], verification: "curated", confidence: 0.8,
    attrs: { story_missions: 69, strangers_and_freaks: 20, hobbies_and_pastimes: 42, random_events: 14, misc_activities: 16 },
    sections: [
      { kind: "requirements", title: "Required counts", status: "verified", text: "Several sources agree that 100% needs 69 story missions, 20 Strangers and Freaks missions, 42 hobbies and pastimes, 14 random events and 16 miscellaneous activities (GamePressure's appendix and GTABase both give these numbers)." },
      { kind: "weights", title: "Category weights", status: "curated", text: "GTABase gives the percentage weights as: story missions 55%, Strangers and Freaks 10%, hobbies and pastimes 10%, random events 5%, miscellaneous activities 20% (total 100%). Another guide quoted different weights, so treat the exact split as single-source." },
      { kind: "missions", title: "Story missions", status: "curated", text: "All 69 missions from the Prologue through one of the three endings; any heist approach or path is fine (GTABase)." },
      { kind: "strangers", title: "Strangers and Freaks", status: "unverified", text: "GTABase says only Franklin's Strangers and Freaks count: Barry's Grass Roots (4), Beverly Felton's Paparazzo (6), Dom Beasley's Risk Assessment (4), Hao's Shift Work (1), Mary-Ann Quinn's Exercising Demons (1), Omega's Far Out and The Final Frontier (2), Peter Dreyfuss' A Starlet in Vinewood (1) and Tonya Wiggins' Pulling Favors (5) — which adds up to 24, while the headline requirement in several guides is 20. The sources do not reconcile this, so confirm in-game before relying on it." },
      { kind: "hobbies", title: "Hobbies and pastimes (42)", status: "curated", text: "GTABase counts: Flight School 12, Shooting Range 6, Hao street races 5, off-road races 6, sea races 4, triathlons 3, tennis 1, darts 1, golf 1, parachuting (all base/heli jumps) and one strip-club private dance — 42 required out of about 61 available." },
      { kind: "random_events", title: "Random events (14)", status: "curated", text: "Any 14 random events count; you choose which. There are about 60 in total (GTABase)." },
      { kind: "misc", title: "Miscellaneous activities (16 of 30)", status: "curated", text: "Required: buy 5 properties; buy a vehicle from a website; walk or play fetch with Chop; complete Booty Call; receive a prostitute's service; hold up a store; visit the cinema; four friend activities (cinema, bar, strip club, darts); collect 50 spaceship parts; collect 50 letter scraps; complete 25 of 50 stunt jumps; 25 of 50 under-the-bridge flights; and 8 of 15 knife flights." },
      { kind: "exclusions", title: "What does NOT count", status: "curated", text: "Per GTABase: Michael's and Trevor's Strangers and Freaks, the remaining hobbies, the other random events, properties beyond five, weapons and vehicles, tattoos, haircuts and enhanced-edition exclusives (such as Peyote Plants and Monkey Mosaics) are not required." },
      { kind: "disambiguation", title: "100% is not achievements", status: "curated", text: "The in-game completion percentage (Pause menu → Stats) is not the same as the achievements/trophies list; 100% completion has its own achievement/trophy, Career Criminal. The Social Club checklist and statistics from other versions are separate." },
    ],
  },
];

/* ───────────────────────────── Strangers & Freaks ───────────────────────────── */
const chain = (id: string, name: string, over: Partial<Ent> & { summary: string; attrs: Ent["attrs"] }): Ent => ({
  id: `activity:${id}`, type: "activity", name, aliases: [], sources: [GP_SF, GTW_SF], verification: "curated", confidence: 0.65, ...over,
});
const strangers: Ent[] = [
  {
    id: "activity:strangers-and-freaks", type: "activity", name: "Strangers and Freaks", aliases: ["Strangers and Freaks", "estranhos e aberrações", "side missions", "missões secundárias", "S&F"],
    summary: "Optional chains given by strangers around San Andreas, each tied to one or more protagonists. 20 of them count for 100% completion; the chains below are documented with their missions and protagonists.",
    sources: [GTW_SF, GP_SF, gb(GB_100, 0.7)], verification: "curated", confidence: 0.65, attrs: { counts_for_100: true, required_for_100: 20 },
    sections: [{ kind: "note", title: "Known gaps", status: "unverified", text: "Sources disagree on a few chains (for example who plays the Abigail and submarine missions, and the Rampages), and the 100% required count (20) differs from the sum of the listed chains (24). Chains not listed in this knowledge base are in the backlog." }],
  },
  chain("stranger-barry", "Barry — Grass Roots", { summary: "Barry's Grass Roots chain exists in versions for all three protagonists. Franklin's version (4 missions) counts for 100%.", attrs: { protagonists: ["Michael", "Franklin", "Trevor"], counts_for_100: true, missions: 4 }, sources: [GP_SF, GTW_SF, gb(GB_100, 0.7)] }),
  chain("stranger-beverly-felton", "Beverly Felton — Paparazzo", { summary: "Franklin's six-mission Paparazzo chain: Paparazzo, The Sex Tape, The Partnership, The Meltdown, The Highness and Reality Check. All six count for 100%.", attrs: { protagonists: ["Franklin"], counts_for_100: true, missions: 6 }, verification: "verified", sources: [GP_SF, GTW_SF, gb(GB_100, 0.7)], confidence: 0.8 }),
  chain("stranger-dom-beasley", "Dom Beasley — Risk Assessment", { summary: "Franklin's Dom chain: Risk Assessment, Liquidity Risk, Targeted Risk and Uncalculated Risk. All four count for 100%.", attrs: { protagonists: ["Franklin"], counts_for_100: true, missions: 4 }, sources: [GTW_SF, gb(GB_100, 0.7)] }),
  chain("stranger-mary-ann-quinn", "Mary-Ann Quinn — Exercising Demons", { summary: "Exercising Demons exists for all three protagonists; only Franklin's version counts for 100%.", attrs: { protagonists: ["Michael", "Franklin", "Trevor"], counts_for_100: true, counts_for: "Franklin" }, sources: [GP_SF, GTW_SF, gb(GB_100, 0.7)] }),
  chain("stranger-omega", "Omega — Far Out / The Final Frontier", { summary: "Franklin's Omega chain: Far Out and The Final Frontier. It unlocks the spaceship-parts collectible, and returning all 50 parts gives the Space Docker.", attrs: { protagonists: ["Franklin"], counts_for_100: true, missions: 2 }, verification: "verified", sources: [GTW_SF, gp("spaceship-parts/z45573", 0.7), gb(GB_100, 0.7)], confidence: 0.85, relations: [{ predicate: "unlocks", to: "collectible:spaceship-parts" }] }),
  chain("stranger-peter-dreyfuss", "Peter Dreyfuss — A Starlet in Vinewood", { summary: "Franklin's A Starlet in Vinewood, tied to the Letter Scraps collectible. It counts for 100%.", attrs: { protagonists: ["Franklin"], counts_for_100: true, missions: 1 }, verification: "verified", sources: [gb(GB_100, 0.7), GP_SF, gtw("Letter_Scraps", 0.8)], confidence: 0.8, relations: [{ predicate: "related_to", to: "collectible:letter-scraps" }] }),
  chain("stranger-tonya-wiggins", "Tonya Wiggins — Pulling Favors", { summary: "Franklin's five-mission Pulling Favors series (Pulling Favors, Pulling Another Favor, Pulling Favors Again, Still Pulling Favors, Pulling One Last Favor). All five count for 100%.", attrs: { protagonists: ["Franklin"], counts_for_100: true, missions: 5 }, verification: "verified", sources: [GP_SF, GTW_SF, gb(GB_100, 0.7)], confidence: 0.8 }),
  chain("stranger-epsilon-program", "Epsilon Program", { summary: "Michael's eight-mission Epsilon series (Seeking the Truth through Unknowing the Truth). It does not count for 100%, but it unlocks the Epsilon Tracts collectible.", attrs: { protagonists: ["Michael"], counts_for_100: false, missions: 8 }, verification: "verified", sources: [GTW_SF, gp("epsilon-tracts/z3566b", 0.6)], confidence: 0.8, relations: [{ predicate: "unlocks", to: "collectible:epsilon-tracts" }] }),
  chain("stranger-maude", "Maude — bounty hunting", { summary: "Trevor's bounty-hunting chain with Maude (targets named by GamePressure: Ralph Ostrowski, Larry Tupper, Glenn Scoville and Curtis Weaver). Not required for 100%.", attrs: { protagonists: ["Trevor"], counts_for_100: false }, verification: "verified", sources: [GP_SF, GTW_SF], confidence: 0.75 }),
  chain("stranger-civil-border-patrol", "Minute Men — Civil Border Patrol", { summary: "Trevor's Civil Border Patrol series (Civil Border Patrol, An American Welcome, Minute Man Blues). Not required for 100%.", attrs: { protagonists: ["Trevor"], counts_for_100: false }, sources: [GP_SF, GTW_SF] }),
  chain("stranger-vinewood-souvenirs", "Nigel and Mrs. Thornhill — Vinewood Souvenirs", { summary: "Michael's multi-part Vinewood Souvenirs series. Not required for 100%.", attrs: { protagonists: ["Michael"], counts_for_100: false }, sources: [GP_SF, GTW_SF] }),
];

/* ───────────────────────────── hobbies / activities ───────────────────────────── */
const hobby = (id: string, name: string, over: Partial<Ent> & { summary: string; attrs: Ent["attrs"] }): Ent => ({
  id: `hobby:${id}`, type: "hobby", name, aliases: [], sources: [gb(GB_100, 0.65)], verification: "curated", confidence: 0.65, ...over,
});
const hobbies: Ent[] = [
  hobby("hobbies-and-pastimes", "Hobbies and Pastimes", {
    aliases: ["hobbies", "atividades", "pastimes", "passatempos", "hobbies and pastimes"], summary: "Optional activities; 42 of about 61 count toward 100% completion: flight school, shooting range, several race types, tennis, darts, golf, parachuting and a strip-club dance. Which protagonist can do each one is not fully documented.",
    sources: [gb(GB_100, 0.7), GP_APPENDIX], attrs: { counts_for_100: true, required_for_100: 42, available: 61 },
    sections: [{ kind: "details", title: "Counts per activity", text: "Flight School 12, Shooting Range 6, Hao street races 5, off-road races 6, sea races 4, triathlons 3, tennis 1, darts 1, golf 1, parachuting (all base jumps and heli jumps) and 1 strip-club private dance." }],
  }),
  hobby("flight-school", "Flight School", { aliases: ["escola de voo", "flight school lessons"], summary: "Flight School has 12 challenges that all count toward 100% completion.", attrs: { counts_for_100: true, count: 12 } }),
  hobby("shooting-range", "Shooting Range", { aliases: ["stand de tiro", "tiro ao alvo"], summary: "The Shooting Range has 6 challenges that count toward 100% completion.", attrs: { counts_for_100: true, count: 6 } }),
  hobby("hao-street-races", "Hao Street Races", { aliases: ["street races", "corridas de rua", "Hao races"], summary: "Hao's street races (5 races, Franklin) count toward 100% completion.", attrs: { counts_for_100: true, count: 5, protagonists: ["Franklin"] }, sources: [gb(GB_100, 0.65), GTW_SF] }),
  hobby("off-road-races", "Off-Road Races", { aliases: ["corridas off-road", "offroad races"], summary: "6 off-road races count toward 100% completion.", attrs: { counts_for_100: true, count: 6 } }),
  hobby("sea-races", "Sea Races", { aliases: ["corridas no mar", "corridas de barco"], summary: "4 sea races count toward 100% completion.", attrs: { counts_for_100: true, count: 4 } }),
  hobby("triathlon", "Triathlon", { aliases: ["triatlo", "triathlons"], summary: "3 triathlon races count toward 100% completion.", attrs: { counts_for_100: true, count: 3 } }),
  hobby("tennis", "Tennis", { aliases: ["tênis"], summary: "One tennis game counts toward 100% completion.", attrs: { counts_for_100: true, count: 1 } }),
  hobby("darts", "Darts", { aliases: ["dardos"], summary: "One darts game counts toward 100% completion; playing darts with a friend is also one of the required friend activities.", attrs: { counts_for_100: true, count: 1 } }),
  hobby("golf", "Golf", { aliases: ["golfe"], summary: "One golf game counts toward 100% completion.", attrs: { counts_for_100: true, count: 1 } }),
  hobby("parachuting", "Parachuting", { aliases: ["paraquedismo", "base jumping", "heli jumps"], summary: "All base jumps and heli jumps count toward 100% completion.", attrs: { counts_for_100: true } }),
  hobby("yoga", "Yoga", { aliases: ["ioga"], summary: "Yoga is Michael's activity, introduced by the mission Did Somebody Say Yoga? (the mission page says it unlocks the yoga activity). Whether it counts for 100% is not documented in the sources checked.", attrs: { protagonists: ["Michael"] }, sources: [gtw("Did_Somebody_Say_Yoga%3F", 0.7)], relations: [{ predicate: "related_to", to: "mission:did-somebody-say-yoga" }] }),
];

/* ───────────────────────────── properties ───────────────────────────── */
const SONAR_NOTE = "GamePressure's unique-vehicle and nuclear-waste pages both give $250,000 for the Sonar Collections Dock.";
const property = (id: string, name: string, over: Partial<Ent> & { summary: string; attrs: Ent["attrs"] }): Ent => ({
  id: `property:${id}`, type: "property", name, aliases: [], sources: [GP_PM], verification: "curated", confidence: 0.55, ...over,
});
const properties: Ent[] = [
  property("safehouses-overview", "Properties — overview", {
    aliases: ["propriedades", "properties", "imóveis", "buy property", "comprar propriedades", "safehouses"],
    summary: "Properties can be bought after the mission Nervous Ron (marked with a $ house icon). Businesses pay weekly into your bank account; others provide vehicle storage. Only 5 properties count for 100%. Some are protagonist-specific.",
    sources: [gb("https://www.gtabase.com/grand-theft-auto-v/properties/", 0.65), gtw("Nervous_Ron", 0.65), GP_PM], verification: "verified", confidence: 0.75,
    attrs: { required_for_100: 5 },
    sections: [
      { kind: "requirements", title: "When you can buy", status: "verified", text: "Three sources agree that purchasing properties becomes possible after completing Nervous Ron." },
      { kind: "money", title: "Total cost", status: "curated", text: "GTABase states the total cost of buying every property is roughly $220,000,000. Exact per-property prices and income are only partly documented (see the individual property entries and the backlog)." },
    ],
    relations: [{ predicate: "related_to", to: "location:michaels-house" }, { predicate: "related_to", to: "location:franklins-strawberry-house" }, { predicate: "related_to", to: "location:trevors-trailer" }, { predicate: "related_to", to: "completion:100-percent" }, { predicate: "requires", to: "mission:nervous-ron" }],
  }),
  property("sonar-collections-dock", "Sonar Collections Dock", {
    aliases: ["Sonar", "doca Sonar"], summary: "A dock business that costs $250,000. Buying it unlocks the submarine and the underwater collectibles (submarine pieces and nuclear waste); GamePressure lists about $23,000 per barrel of nuclear waste and a $250,000 completion bonus.",
    sources: [gp("unique-vehicles/ze55bb", 0.65), gp("radioactive-waste/ze55c1", 0.65)], verification: "verified", confidence: 0.75,
    attrs: { price: 250000, unlocks: ["Submarine", "Submarine Pieces", "Nuclear Waste"] },
    sections: [{ kind: "money", title: "Price and returns", status: "curated", text: `Price $250,000 (${SONAR_NOTE}) Returns documented: ~$23,000 per nuclear-waste barrel and $250,000 for collecting all of them (single source, wording is approximate).` }],
    relations: [{ predicate: "unlocks", to: "vehicle:submarine" }, { predicate: "unlocks", to: "collectible:nuclear-waste" }, { predicate: "unlocks", to: "collectible:submarine-pieces" }, { predicate: "located_at", to: "location:sonar-collections-dock" }],
  }),
  property("towing-impound", "Towing Impound (Car Scrapyard)", {
    aliases: ["Car Scrapyard", "Towing Impound", "ferro-velho"], summary: "Franklin's property in South Los Santos: a towing/scrapyard business reported at $150,000, paying about $500 per vehicle towed. Price and income come from one aggregated source and are unverified.",
    verification: "unverified", confidence: 0.4, attrs: { price: 150000, character: "Franklin" }, sources: [GP_PM],
    sections: [{ kind: "money", title: "Reported figures", status: "unverified", text: "A search aggregation reports $150,000 and $500 per tow; GamePressure lists the Car Scrapyard among property missions without prices." }],
  }),
  property("downtown-cab-co", "Downtown Cab Co.", {
    aliases: ["Taxi", "Downtown Cab", "empresa de táxi"], summary: "Franklin's taxi business in East Vinewood; reported at $200,000 with about $2,000 per week. Figures are unverified (single aggregated source); GamePressure lists a Downtown Cab Co. property mission.",
    verification: "unverified", confidence: 0.4, attrs: { price: 200000, character: "Franklin" }, sources: [GP_PM],
  }),
  property("tequi-la-la", "Tequi-la-la", {
    aliases: ["Tequila-la", "bar Tequi-la-la"], summary: "A nightclub property reported at $2,000,000 with weekly income. The figures come from a single aggregated source and are unverified; GamePressure lists a Tequi-la-la property mission.",
    verification: "unverified", confidence: 0.4, attrs: { price: 2000000 }, sources: [GP_PM],
  }),
  property("property-missions", "Property missions (list)", {
    aliases: ["missões de propriedade", "property missions"], summary: "GamePressure documents property missions for: Pitchers, McKenzie Field Hangar, Car Scrapyard, Ten Cent Theater, Downtown Cab Co., Tivoli Theater, Doppler Cinema, Smoke on the Water, Tequi-la-la, Hookies and The Hen House. Prices, income and which protagonist can buy each are not documented there.",
    attrs: { count: 11 },
  }),
];

/* ───────────────────────────── random events ───────────────────────────── */
const randomEvents: Ent[] = [
  {
    id: "random_event:random-events-overview", type: "random_event", name: "Random Events", aliases: ["random events", "eventos aleatórios", "eventos randômicos"],
    summary: "About 60 random events can happen around San Andreas; any 14 count toward 100% completion. GamePressure documents them by name; per-event locations, rewards and protagonist restrictions are mostly not documented.",
    sources: [GP_RE, gb(GB_100, 0.65)], verification: "curated", confidence: 0.6, attrs: { counts_for_100: true, required_for_100: 14, total: 60 },
    sections: [
      { kind: "catalog", title: "Event names documented by GamePressure", status: "curated", text: "Getaway driver; Bike thief; Sport bike thief; Construction site accident; Mugging; Countryside robbery; Prisoner lift; Crash rescue; Drunk driver; Deal gone wrong; Border patrol; Car theft; Chase thieves (city and country); Gang intimidation; Store robbery; Hitchhiker (4 variants); Security vans (10); Drug shootout; Altruist cult shootout; and others such as domestic dispute, ATM robbery, burial, snatched, bus tour and stag do." },
      { kind: "details", title: "Specifics that are documented", status: "curated", text: "The Altruist cult shootout is Trevor-specific. The hitchhiker events have an alternative outcome where you deliver hitchhikers to the Altruist cult; one hidden package requires bringing three hitchhikers there. Whether each event repeats is not documented." },
    ],
    relations: [{ predicate: "related_to", to: "completion:100-percent" }],
  },
];

/* ───────────────────────────── money, stock market, assassination strategy ───────────────────────────── */
const money: Ent[] = [
  {
    id: "stock:stock-market", type: "stock", name: "Stock market (LCN and BAWSAQ)", aliases: ["stock market", "mercado de ações", "ações", "BAWSAQ", "LCN", "bolsa", "investir", "stocks"],
    summary: "GTA V has an in-game stock market with two exchanges, LCN and BAWSAQ, used from the in-game browser. Lester's five assassination contracts move specific stocks, which makes them the best-known way to make large amounts of money; the effect can differ by game version.",
    sources: [gb(GB_STOCK, 0.7), gtw("BAWSAQ", 0.6)], verification: "curated", confidence: 0.7,
    sections: [
      { kind: "money", title: "How it is used", status: "curated", text: "The documented approach is to buy a stock shortly before a contract, sell after the contract moves its price, and re-invest in the stock that rebounds. See the Lester assassination strategy entry for each contract's stocks and timing." },
      { kind: "versions", title: "Version differences", status: "curated", versions: ["PS4", "PS5", "PC"], text: "GTABase warns that stock behaviour differs across versions: it quotes about +80% on the first contract's stock on older versions versus about +21% on the next-gen version, and says some players report returns well below the listed percentages. Keep separate save slots before each contract and investment." },
      { kind: "exchanges", title: "Exchanges", status: "unverified", text: "One aggregated guide says the LCN reacts mainly to in-game events while BAWSAQ is influenced by the wider player community; this is not confirmed by the other sources." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:lester-assassination-strategy" }, { predicate: "related_to", to: "character:lester-crest" }],
  },
  {
    id: "game_mechanic:lester-assassination-strategy", type: "game_mechanic", name: "Lester's assassinations — stock strategy", aliases: ["assassination stock strategy", "estratégia de ações dos assassinatos", "Lester assassinations money", "how to make billions", "bilhões", "stock tips"],
    summary: "Five Franklin contracts from Lester move specific stocks. Documented order and stocks: Hotel (Betta Pharmaceuticals, then Bilkington), Multi-Target (Debonaire, then Redwood), Vice (Fruit, then Facade), Bus (Vapid) and Construction (Gold Coast Development). Guides project very large profits; this is strategy, not an official mechanic.",
    sources: [gb(GB_STOCK, 0.7), gtw("Hotel_Assassination", 0.7), gtw("The_Multi-Target_Assassination", 0.7), gtw("The_Vice_Assassination", 0.7), gtw("The_Construction_Assassination", 0.7)], verification: "curated", confidence: 0.7,
    sections: [
      { kind: "money", title: "Which stocks move (corroborated)", status: "verified", text: "Grand Theft Wiki's mission pages and GTABase agree on the stocks: Hotel Assassination → Betta Pharmaceuticals (buy before, sell after) then Bilkington Research; Multi-Target → Debonaire Cigarettes (before) and Redwood Cigarettes (rebound); Vice → Fruit (before) then Facade; Construction → Gold Coast Development (before)." },
      { kind: "money", title: "Bus Assassination", status: "unverified", text: "Both sources say to invest in Vapid Motor Company after the mission and sell about two in-game days later, but they disagree about which exchange lists Vapid." },
      { kind: "strategy", title: "Projected returns (guide claims)", status: "unverified", text: "GTABase quotes roughly +80% on the first contract's stocks, +320% on Redwood, +50%/+33% on Fruit/Facade, +100% on Vapid and +90% on Gold Coast, and projects about $2 billion per protagonist in total. These percentages are one guide's claims, are version-dependent, and some players report much lower results." },
      { kind: "strategy", title: "Practical advice (opinion)", status: "unverified", text: "GTABase advises making separate save slots before each contract and investment, and doing the later contracts after finishing the main story; it also calls the Multi-Target contract the most important step. Treat these as one guide's recommendations." },
      { kind: "timing", title: "Timing", status: "curated", text: "Invest right before starting the mission and sell when prices peak, usually shortly after completion. The Vice contract's second stock is bought about two in-game hours later and sold after about two in-game days." },
    ],
    relations: [{ predicate: "related_to", to: "stock:stock-market" }, { predicate: "related_to", to: "character:lester-crest" }, { predicate: "related_to", to: "mission:hotel-assassination" }, { predicate: "related_to", to: "mission:the-multi-target-assassination" }, { predicate: "related_to", to: "mission:the-vice-assassination" }, { predicate: "related_to", to: "mission:the-bus-assassination" }, { predicate: "related_to", to: "mission:the-construction-assassination" }],
  },
  {
    id: "game_mechanic:money-overview", type: "game_mechanic", name: "Making money in Story Mode", aliases: ["money", "dinheiro", "ganhar dinheiro", "fazer dinheiro", "maximizar dinheiro", "after story money", "dinheiro depois da história"],
    summary: "Documented money sources: heist payouts (Jewel Store Job up to $4,946,153 gross, Paleto Score up to $8,016,020, Big Score 40+ million per protagonist with an optimised crew), Lester's stock-market contracts, and property businesses. Strategies for after the story beyond these are not validated.",
    sources: [gb(GB_100, 0.6), gtw("The_Jewel_Store_Job", 0.8), gtw("The_Paleto_Score", 0.8)], verification: "curated", confidence: 0.7,
    sections: [
      { kind: "money", title: "Documented levers", status: "curated", text: "Heists: choose crew by cut versus skill; payouts are listed in each heist entry. Stock market: Lester's five contracts (see the strategy entry). Properties: some businesses pay weekly; only 5 properties count for 100%. The Merryweather Heist and Blitz Play pay no cash." },
      { kind: "strategy", title: "What is not validated", status: "unverified", text: "The best post-story money method, exact weekly property incomes, and any claim that a particular order of missions maximises cash are not validated in this knowledge base." },
    ],
    relations: [{ predicate: "related_to", to: "stock:stock-market" }, { predicate: "related_to", to: "game_mechanic:lester-assassination-strategy" }, { predicate: "related_to", to: "heist:big-score" }, { predicate: "related_to", to: "heist:jewel-store-job" }, { predicate: "related_to", to: "heist:paleto-score" }],
  },
  {
    id: "game_mechanic:heist-crew-roster", type: "game_mechanic", name: "Heist crew roster and cuts", aliases: ["crew cuts", "cortes da equipe", "Karim Denz", "Taliana Martinez", "Paige Harris", "Rickie Lukens", "Packie McReary", "Norm Richards", "Daryl Johns", "Gustavo Mota"],
    summary: "Heist crew members have different skill and cut. Documented cuts: gunmen Gustavo Mota 14%, Packie McReary 12%, Norm Richards 10.5%, Daryl Johns 6%; drivers Eddie Toh 14%, Karim Denz 8%, Taliana Martinez 5%; hackers Paige Harris 15%, Christian Feltz 10%, Rickie Lukens 4%.",
    sources: [gtw("The_Jewel_Store_Job", 0.75), gb(GB_BIG, 0.65), gi("https://gtaintel.com/news/gta-5-heists-complete-crew-guide", 0.5)], verification: "curated", confidence: 0.65,
    sections: [
      { kind: "crew", title: "Cuts and roles", status: "curated", text: "Jewel Store Job list (Grand Theft Wiki): Gustavo Mota 14%, Packie McReary 12%, Norm Richards 10.5% (gunmen); Eddie Toh 14%, Karim Denz 8% (drivers); Paige Harris 15%, Christian Feltz 10%, Rickie Lukens 4% (hackers). Big Score sample (GTABase): Taliana Martinez 5%, Daryl Johns 6%, Karim Denz 8%, Paige Harris 15%. Cuts can differ by heist." },
      { kind: "strategy", title: "Choosing (opinion)", status: "unverified", text: "Guides such as GTAIntel recommend mid-skill, mid-cut crew with low complication; Taliana Martinez is described as the best driver and is unlocked through a side mission. This is opinion, and guides disagree on the optimum." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }],
  },
];

/* ───────────────────────────── versions, cheats overview ───────────────────────────── */
const versions: Ent[] = [
  {
    id: "version:editions-overview", type: "version", name: "GTA V versions and editions", aliases: ["versions", "versões", "plataformas", "PC Enhanced", "PC Legacy", "PS5", "Xbox Series", "PS4", "Xbox One", "PS3", "Xbox 360", "original", "next-gen", "enhanced edition", "diferenças entre versões"],
    summary: "GTA V launched on PS3 and Xbox 360 (2013), then PS4/Xbox One (2014), PC (2015), PS5/Xbox Series (2022) and an Enhanced PC edition alongside the Legacy PC edition. Some Story Mode content is version-scoped: Peyote Plants and Monkey Mosaics are not in the PS3/Xbox 360 versions.",
    sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.75), gp("monkey-mosaics-images/z2716d", 0.6), gtw("Peyote_Plants", 0.75)], verification: "curated", confidence: 0.7,
    sections: [
      { kind: "versions", title: "Version-scoped Story Mode content", status: "curated", versions: ["PS4/Xbox One", "PS5/Xbox Series", "PC"], text: "Peyote Plants (27) exist only on PS4, Xbox One, PC and later. Monkey Mosaics (50) are described as part of the re-release on newer consoles and PC. 100% completion does not require enhanced-edition exclusives (GTABase)." },
      { kind: "versions", title: "Stock market and Railgun", status: "unverified", text: "Stock returns from Lester's contracts differ between versions (one guide: about +80% on older versions vs about +21% on next-gen for the first contract). Whether the Railgun is available in Story Mode may also depend on the version; sources disagree." },
      { kind: "versions", title: "Not validated", status: "unverified", text: "Detailed PC Legacy versus PC Enhanced differences, mod compatibility and per-platform cheat availability are not validated; do not assume compatibility." },
    ],
  },
];

const cheats: Ent[] = [
  {
    id: "cheat:cheats-overview", type: "cheat", name: "Cheats overview", aliases: ["cheats", "códigos", "truques", "cheat codes", "how to enter cheats", "cheats PlayStation", "cheats Xbox", "phone cheats"],
    summary: "Cheats are separated by platform. PC: open the console with the tilde (~) key and type the code (19 codes are documented here). PlayStation, Xbox and phone-number inputs are NOT recorded because the sources checked were inconsistent. Cheats may disable achievements/trophies.",
    sources: [gtw("Cheats_in_GTA_V", 0.85), gp("cheat-codes/zb5688", 0.6)], verification: "curated", confidence: 0.8,
    sections: [
      { kind: "platforms", title: "What is documented per platform", status: "verified", versions: ["PC"], text: "PC: documented (see the individual cheat entries). PlayStation: not recorded. Xbox: not recorded. Phone numbers: not recorded. Never assume a cheat from one platform works on another." },
      { kind: "warning", title: "Achievements (the sources diverge)", status: "unverified", text: "Grand Theft Wiki says activating a cheat disables achievements for that session only; GamePressure says achievements are turned off after activation and, if you save while the cheat is active, remain disabled on every later save. Because the sources disagree, avoid saving after using cheats if you care about achievements/trophies." },
    ],
  },
];

/* ───────────────────────────── troubleshooting ───────────────────────────── */
const trb = (id: string, name: string, aliases: string[], summary: string, sections: Ent["sections"], over: Partial<Ent> = {}): Ent => ({
  id: `troubleshooting:${id}`, type: "troubleshooting", name, aliases, summary, sections, sources: [gw("Missions_in_GTA_V", 0.7), gtw("Missions_in_GTA_V", 0.85)], verification: "curated", confidence: 0.7, ...over,
});
const troubleshooting: Ent[] = [
  trb("mission-not-appearing", "A mission does not appear or cannot be started", ["mission not appearing", "missão não aparece", "não consigo iniciar a missão", "mission not available", "missão bloqueada", "can't start mission", "my mission is missing", "mission won't start", "my mission won't start", "missão não inicia"],
    "Checklist for a mission that does not appear: identify its giver and protagonist, finish every prerequisite and heist setup, check time-of-day, wanted level and active-mission conditions, and confirm your version.",
    [
      { kind: "symptoms", title: "Symptoms", text: "A mission blip is missing, the phone call never comes, or the mission is greyed out/unavailable." },
      { kind: "causes", title: "Possible causes", text: "The prerequisite mission or heist setup is not complete; the mission belongs to a different protagonist (the blip shows the character); you have a wanted level or are on another mission; some missions only start at certain times of day; a version-scoped item is not in your edition." },
      { kind: "steps", title: "Checks, in order", text: "1) Identify the mission and giver. 2) Check which protagonist it belongs to and switch to them. 3) Complete the previous story missions and, for heists, every setup mission of your chosen approach. 4) Make sure you have no wanted level and no active mission. 5) Wait for the right time of day if the mission is time-gated. 6) For Strangers and Freaks, confirm the stranger's requirements (several are unlocked by earlier missions or collectibles). 7) Check your game version." },
      { kind: "solution", title: "Caveat on unlock chains", status: "unverified", text: "Wiki pages disagree about some unlock chains (for example Hood Safari versus Blitz Play), so if a documented prerequisite does not unlock the mission, try the other protagonist-specific prerequisites before concluding it is a bug." },
      { kind: "technical", title: "Technical problems", text: "If the game crashes, freezes or fails to launch, that is a technical problem rather than a gameplay one: use the official Rockstar Support page for GTA V." },
    ]),
  trb("technical-pc-issues", "Technical problems (crashes, launch, installation)", ["crash", "travando", "não abre", "erro ao iniciar", "launch error", "game crashes", "technical issue", "problema técnico", "Rockstar Games Launcher"],
    "Technical problems (crashes, launch failures, installation errors, the Rockstar Games Launcher) are separate from gameplay problems. The official Rockstar Support page for GTA V is the authoritative source.",
    [{ kind: "steps", title: "First steps", text: "Check the official Rockstar Support page for GTA V for your platform. Typical first steps in general are verifying game files, updating graphics drivers and restarting the launcher; specific error-code solutions are not stored in this knowledge base." }],
    { sources: [rs("https://support.rockstargames.com/gta-v", "rockstar-support", 0.85)], confidence: 0.7 }),
  trb("cannot-buy-property", "I can't buy a property", ["não consigo comprar", "can't buy property", "property not available", "propriedade não disponível", "why can't I buy this"],
    "If a property cannot be bought, check that you completed Nervous Ron, that the property is available to your current protagonist, and that you have enough money; confirm you are looking at a Story Mode property, not a GTA Online one.",
    [
      { kind: "causes", title: "Possible causes", text: "Properties unlock after Nervous Ron (three sources agree); some properties are protagonist-specific; the price may exceed your cash (the Sonar Collections Dock costs $250,000); the listing may be a GTA Online property." },
      { kind: "steps", title: "Checks", text: "1) Complete Nervous Ron. 2) Switch to the protagonist that the property belongs to. 3) Look for the house icon with a $ on the map. 4) Check your balance against the listed price." },
    ], { sources: [gb("https://www.gtabase.com/grand-theft-auto-v/properties/", 0.65), gtw("Nervous_Ron", 0.65), gp("unique-vehicles/ze55bb", 0.6)] }),
  trb("collectible-not-appearing", "A collectible did not appear or I can't start it", ["collectible not showing", "colecionável não aparece", "spaceship parts not showing", "peças não aparecem", "submarine pieces missing"],
    "Several collectibles only become available after a prerequisite: Spaceship Parts after Omega's stranger mission (Franklin); Submarine Pieces and Nuclear Waste after buying the Sonar Collections Dock; Epsilon Tracts after Michael's eight Epsilon missions; Peyote Plants and Monkey Mosaics need a version newer than PS3/Xbox 360.",
    [
      { kind: "steps", title: "Prerequisites", text: "Spaceship Parts: finish the Omega mission first (only Franklin can start it; all three can collect). Submarine Pieces / Nuclear Waste: buy the Sonar Collections Dock ($250,000). Epsilon Tracts: complete the eight Epsilon missions as Michael. Letter Scraps: tied to A Starlet in Vinewood (Franklin)." },
      { kind: "versions", title: "Version", status: "curated", versions: ["PS4/Xbox One", "PS5/Xbox Series", "PC"], text: "Peyote Plants (27) and Monkey Mosaics (50) exist only on PS4/Xbox One/PC and later; they do not exist on PS3/Xbox 360." },
    ], { sources: [gp("spaceship-parts/z45573", 0.65), gp("submarine-parts/z7566f", 0.55), gp("epsilon-tracts/z3566b", 0.6), gtw("Peyote_Plants", 0.75)] }),
  trb("protagonist-not-getting-mission", "My protagonist isn't receiving the mission", ["personagem não recebe missão", "wrong character mission", "mission for another character", "switch character mission", "o personagem não liga"],
    "Missions and strangers are tied to protagonists: Epsilon is Michael's, Omega and Paparazzo are Franklin's, Maude's bounty work and Civil Border Patrol are Trevor's. Switch to the right protagonist and check the mission blip's letter.",
    [{ kind: "steps", title: "Checks", text: "Look at the blip: it shows which protagonist the mission belongs to. Switch characters from the character wheel, make sure that protagonist has no wanted level or active mission, and finish their prerequisites. Some chains (Grass Roots, Exercising Demons) have a version for each protagonist." }],
    { sources: [GP_SF, GTW_SF] }),
  trb("random-event-activation", "How do I trigger a random event?", ["ativar evento aleatório", "random event not happening", "como ativar eventos", "how to start random event"],
    "Random events are not started from a menu: they occur around San Andreas as you travel, and any 14 count for 100%. Per-event locations and triggers are mostly not documented here.",
    [{ kind: "steps", title: "What is known", status: "unverified", text: "Events appear as you move around the map; one guide mentions blue/red dots on the minimap. Specific triggers, locations and repeatability per event are not validated in this knowledge base." }],
    { sources: [GP_RE, gb(GB_100, 0.6)], verification: "unverified" }),
  trb("version-compatibility", "Does this work on my version?", ["isso funciona na minha versão", "does this work on PS3", "works on PC", "compatível com a minha versão", "version compatibility"],
    "Some Story Mode content is version-scoped (Peyote Plants, Monkey Mosaics, stock-market returns, possibly the Railgun). Cheat inputs are platform-specific, and only PC codes are recorded here. Tell the agent which version you play.",
    [{ kind: "versions", title: "Known version-scoped items", status: "curated", versions: ["PS3/Xbox 360", "PS4/Xbox One", "PS5/Xbox Series", "PC"], text: "Not on PS3/Xbox 360: Peyote Plants, Monkey Mosaics. Stock returns differ by version. PC Legacy versus PC Enhanced differences are not validated." }],
    { sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.7), gp("monkey-mosaics-images/z2716d", 0.6), gtw("Peyote_Plants", 0.75)] }),
];


/* ───────────────────────────── 100% completion: structured breakdown ───────────────────────────── */
const comp = (id: string, name: string, aliases: string[], summary: string, sections: NonNullable<Ent["sections"]>, over: Partial<Ent> = {}): Ent => ({
  id: `completion:${id}`, type: "completion", name, aliases, summary, sections, sources: [gb(GB_100, 0.7), GP_APPENDIX], verification: "curated", confidence: 0.7,
  relations: [{ predicate: "part_of", to: "completion:100-percent" }], ...over,
});
completion.push(
  comp("missions", "100%: story missions", ["missões para 100%", "story missions for 100%", "quantas missões para 100%"],
    "For 100% you need 69 story missions, from the Prologue through one of the three endings; every heist approach is acceptable. (This is the required number, not the number of mission entries in this knowledge base: see the counting methodology.)",
    [{ kind: "requirements", title: "What counts", status: "curated", text: "69 story missions through one of the three endings; any heist approach or path is fine (GTABase). One guide adds that the five Lester assassination contracts are included in the 69; the others do not say, so treat that as unconfirmed." },
     { kind: "protagonist", title: "Who plays them", status: "curated", text: "Story missions are played by whichever protagonist the mission belongs to; there is nothing to choose except the heist approaches and the ending." }]),
  comp("mission-count-methodology", "How missions are counted (79 vs 69 vs 68 vs 86)", ["quantas missões existem", "how many missions", "mission count", "contagem de missões", "79 missões"],
    "This knowledge base lists 79 story mission entries (the ordered list on Grand Theft Wiki: Prologue, main missions, heist setups, heists, 5 Lester contracts and 3 endings). Other sites give other numbers because they count differently: 100% needs 69; GTA5Wiki's story page shows 68; GamePressure advertises 86. The differences are scope, not errors.",
    [{ kind: "methodology", title: "Why the numbers differ", status: "curated", text: "Our 79 = the Grand Theft Wiki ordered mission list, counting every setup mission (including three 'Getaway Vehicle' setups), every heist, the five Lester assassination contracts and all three ending missions (only one ending is needed). The 100% requirement (69) is a completion rule, not a total. GTA5Wiki (68) and GamePressure (86) group or split missions differently. No source is assumed wrong; the entries here follow one ordered list so every entry has a stable position." }],
    { sources: [gtw("Missions_in_GTA_V", 0.85), g5w("missions/story/", 0.5), gp("main-missions/ze54cb", 0.5), gb(GB_100, 0.6)] }),
  comp("strangers-and-freaks", "100%: Strangers and Freaks", ["strangers para 100%", "S&F 100%", "which strangers count"],
    "The headline requirement is 20 Strangers and Freaks missions. GTABase says only Franklin's chains count: Grass Roots (4), Paparazzo (6), Risk Assessment (4), Shift Work (1), Exercising Demons (1), Omega (2), A Starlet in Vinewood (1) and Pulling Favors (5). The listed chains sum to 24, so the sources do not fully reconcile.",
    [{ kind: "requirements", title: "Which chains", status: "unverified", text: "Required (Franklin): Barry's Grass Roots, Beverly Felton's Paparazzo, Dom Beasley's Risk Assessment, Hao, Mary-Ann Quinn's Exercising Demons, Omega, Peter Dreyfuss and Tonya Wiggins. Michael's and Trevor's chains (Epsilon Program, Maude, Civil Border Patrol, Vinewood Souvenirs…) are not required. 20 versus 24 is an open conflict." }]),
  comp("hobbies", "100%: hobbies and pastimes", ["hobbies para 100%", "atividades para 100%"],
    "42 of about 61 hobbies and pastimes count: Flight School 12, Shooting Range 6, Hao street races 5, off-road races 6, sea races 4, triathlons 3, tennis 1, darts 1, golf 1, parachuting and 1 strip-club dance.",
    [{ kind: "requirements", title: "Counts", status: "curated", text: "Flight School 12; Shooting Range 6; Hao street races 5; off-road races 6; sea races 4; triathlons 3; tennis 1; darts 1; golf 1; all parachute jumps; 1 strip-club private dance (GTABase). Which protagonist can do each is not documented." }]),
  comp("random-events", "100%: random events", ["eventos aleatórios para 100%"], "Any 14 random events count (there are about 60); you choose which ones.", [{ kind: "requirements", title: "Counts", status: "curated", text: "Any 14 random events; the rest can be ignored. The Altruist cult shootout is Trevor-specific, so avoid relying on it as Michael or Franklin." }]),
  comp("misc-activities", "100%: miscellaneous activities (16)", ["atividades diversas 100%", "misc activities", "miscellaneous"], "16 of 30 miscellaneous activities are required: 5 properties, a website vehicle purchase, time with Chop, a few leisure and friend activities, 50 spaceship parts, 50 letter scraps, 25 stunt jumps, 25 under-the-bridge flights and 8 knife flights.",
    [{ kind: "requirements", title: "Required list", status: "curated", text: "Buy 5 properties; buy a vehicle from a website; walk or play fetch with Chop; complete Booty Call; receive a prostitute's service; hold up a store; visit the cinema; friend activities (cinema, bar, strip club, darts); collect 50 spaceship parts; collect 50 letter scraps; 25 of 50 stunt jumps; 25 of 50 under-the-bridge flights; 8 of 15 knife flights." }]),
  comp("what-to-ignore", "100%: what you can ignore", ["o que posso ignorar no 100%", "what doesn't count for 100%", "skip for 100%"], "You can ignore Michael's and Trevor's Strangers and Freaks, hobbies beyond 42, all but 14 random events, properties beyond five, weapons, vehicles, tattoos, haircuts and enhanced-edition exclusives such as Peyote Plants and Monkey Mosaics.",
    [{ kind: "exclusions", title: "Not required", status: "curated", text: "Per GTABase: Michael/Trevor Strangers and Freaks, remaining hobbies, other random events, properties beyond five, all weapons and vehicles, tattoos, haircuts, and enhanced-edition exclusives. Nuclear waste, submarine pieces, hidden packages, epsilon tracts and rampages are not on the required miscellaneous list either." }]),
  comp("by-protagonist", "100%: who has to do what", ["qual personagem faz o quê no 100%", "which character for 100%", "personagem para o 100%"], "Story missions are played by their own protagonist. For Strangers and Freaks only Franklin's chains count. Hobbies and miscellaneous items are not documented per protagonist except where noted (Hao's races are Franklin's).",
    [{ kind: "protagonist", title: "Who", status: "curated", text: "Franklin: the required Strangers and Freaks and Hao's street races. Michael: his story missions and yoga (not confirmed for 100%). Trevor: his story missions; his Rampages are not on the required list. Collectibles on the list (spaceship parts, letter scraps, jumps and flights) can be collected by any protagonist, except that the Omega mission that starts the parts is Franklin's." }]),
  comp("practical-plan", "100%: a practical order (derived plan)", ["quero fazer 100%", "I want 100%", "o que preciso fazer para 100%", "100% step by step"], "A derived order for 100%: finish the story (one ending), then Franklin's required strangers, the 16 miscellaneous activities, 42 hobbies and any 14 random events. This plan is derived from the checklists and is not an official guide.",
    [{ kind: "steps", title: "Plan", status: "curated", text: "Step 1: play the 69 required story missions through one ending (keep Lester's contracts for after the story if you want the stock-market money). Step 2: Franklin's required strangers (24 listed; 20 headline). Step 3: miscellaneous activities (5 properties after Nervous Ron, Chop, cinema, friend activities, 50 spaceship parts after Omega, 50 letter scraps, 25 stunt jumps, 25 under-the-bridge flights, 8 knife flights). Step 4: 42 hobbies (flight school and the races take the most). Step 5: any 14 random events. Check the in-game completion percentage (Pause menu, Stats) to see what is left." }]),
);

/* ───────────────────────────── Strangers & Freaks: conflict register ───────────────────────────── */
const SFC = (n: number, a: string, b: string, diff: string, conf: number) => `Conflict ${n} — Source A: ${a} Source B: ${b} Difference: ${diff} Confidence in the resolution used here: ${conf}%.`;
strangers.push({
  id: "activity:strangers-source-conflicts", type: "activity", name: "Strangers and Freaks — where sources disagree", aliases: ["strangers conflicts", "conflitos entre fontes strangers", "source disagreements strangers"],
  summary: "Register of disagreements between sources about Strangers and Freaks and related collectibles, each with source A, source B, the difference and a confidence. Nothing is hidden or resolved by guesswork.",
  sources: [GTW_SF, GP_SF, gb(GB_100, 0.7), g5w("collectibles/", 0.5)], verification: "unverified", confidence: 0.6, attrs: { counts_for_100: false },
  sections: [
    { kind: "conflict", title: "Peter Dreyfuss — A Starlet in Vinewood", status: "unverified", text: SFC(1, "Grand Theft Wiki's stranger table lists Michael.", "GTABase, GamePressure and Grand Theft Wiki's Letter Scraps page tie it to Franklin.", "the protagonist who plays it", 80) + " This knowledge base uses Franklin." },
    { kind: "conflict", title: "Required count: 20 vs 24", status: "unverified", text: SFC(2, "GamePressure and others say 20 Strangers and Freaks missions count.", "GTABase's list of Franklin chains adds up to 24 missions.", "the number of required S&F missions", 50) },
    { kind: "conflict", title: "Barry — Grass Roots", status: "unverified", text: SFC(3, "Grand Theft Wiki: 4 of 6 Grass Roots missions are required.", "GTABase: the Grass Roots series (4 missions).", "none in the count; the mission names are listed differently", 70) },
    { kind: "conflict", title: "Rampages", status: "unverified", text: SFC(4, "Grand Theft Wiki's table assigns the Rampages to Franklin.", "GTA5Wiki lists them as Trevor-only (Red Mist).", "which protagonist plays them", 40) },
    { kind: "conflict", title: "Abigail / submarine strand", status: "unverified", text: SFC(5, "Grand Theft Wiki: Abigail's Death at Sea and What Lies Beneath are Franklin's.", "GamePressure: Death at Sea is Michael's and starts after buying the Sonar Collections Dock; GTA5Wiki ties the submarine pieces to an Abigail Mathers strand.", "protagonist and trigger", 30) },
    { kind: "conflict", title: "Hao", status: "unverified", text: SFC(6, "Grand Theft Wiki and GTABase's hobby list: Hao's street races (5 races, a hobby).", "GTABase's S&F list also names 'Shift Work' (1 mission) for Hao.", "whether Hao's content is a hobby, a stranger mission, or both", 50) },
  ],
});

/* ───────────────────────────── troubleshooting matrix ───────────────────────────── */
const row = (n: number, problem: string, cause: string, diagnostic: string, solution: string, version: string, source: string) =>
  `Problem ${n}: ${problem} Possible cause: ${cause} Diagnostic: ${diagnostic} Solution: ${solution} Version: ${version} Source: ${source}`;
troubleshooting.push({
  id: "troubleshooting:matrix", type: "troubleshooting", name: "Troubleshooting matrix (problem · cause · diagnostic · solution · version · source)",
  aliases: ["matriz de problemas", "troubleshooting matrix", "problemas comuns", "common problems", "não consigo usar essa arma", "esse veículo existe no story mode", "o evento não aparece", "o collectible não está aqui"],
  summary: "A matrix of common problems: missions that do not appear or start, collectibles that are missing, properties that cannot be bought, random events that do not show, weapons that cannot be used, vehicles that may not exist in Story Mode.",
  sources: [gtw("Missions_in_GTA_V", 0.8), gb("https://www.gtabase.com/grand-theft-auto-v/properties/", 0.65), gp("spaceship-parts/z45573", 0.65)], verification: "curated", confidence: 0.65,
  sections: [
    { kind: "matrix", title: "Mission does not appear", status: "curated", text: row(1, "My mission does not appear.", "A prerequisite mission or heist setup is not complete, or it belongs to another protagonist.", "Check the blip's letter/colour and the giver; look at the unlock chain on the mission entry.", "Finish the prerequisite, switch protagonist, clear any wanted level or active mission.", "All versions", "Grand Theft Wiki mission pages (unlock chains are partly UNVERIFIED).") },
    { kind: "matrix", title: "Mission cannot be started", status: "curated", text: row(2, "I can't start the mission.", "Wanted level, another mission running, wrong time of day, wrong protagonist, or the mission is a heist whose setups are not finished.", "See whether the heist entry lists setups you have not done.", "Complete every setup for your chosen approach; wait for the right time; lose the cops.", "All versions", "Grand Theft Wiki.") },
    { kind: "matrix", title: "Collectible is not there", status: "curated", text: row(3, "The collectible isn't here.", "A prerequisite has not been met (Omega for spaceship parts, buying the Sonar Collections Dock for submarine pieces and nuclear waste, the eight Epsilon missions for tracts) or it is version-scoped.", "Check the collectible entry's requirement and versions.", "Do the prerequisite; peyote and monkey mosaics do not exist on PS3/Xbox 360.", "PS4/Xbox One/PC and newer for peyote and monkey mosaics", "GamePressure; Grand Theft Wiki.") },
    { kind: "matrix", title: "Cannot buy a property", status: "curated", text: row(4, "I can't buy this property.", "Nervous Ron is not done, the property belongs to another protagonist, you lack money, or it is a GTA Online property.", "Look for the house icon with a $ on the map and compare your cash with the price.", "Complete Nervous Ron, switch protagonist, save money.", "All versions", "GTABase; Grand Theft Wiki; GamePressure.") },
    { kind: "matrix", title: "Random event does not appear", status: "unverified", text: row(5, "The random event doesn't appear.", "Events occur as you travel and are not on a menu; some are protagonist-specific (the Altruist cult shootout is Trevor's).", "Travel in the open world and watch the minimap.", "Keep exploring; only 14 events are needed for 100%.", "All versions", "GamePressure; GTABase (triggers are not documented).") },
    { kind: "matrix", title: "Cannot use a weapon", status: "unverified", text: row(6, "I can't use this weapon.", "It may not exist in Story Mode (some weapons are GTA Online only), may be unlocked late (Advanced Rifle at the Altruist village per one guide), may need Social Club membership (Assault SMG) or may depend on the version (Railgun is disputed).", "Check the weapon entry's availability field.", "Follow the unlock noted on the entry; if it says UNKNOWN there is no confirmed way.", "Version-dependent for the Railgun", "Grand Theft Wiki weapon list; GamePressure; GTA5Wiki.") },
    { kind: "matrix", title: "Vehicle may not exist in Story Mode", status: "curated", text: row(7, "Does this vehicle exist in Story Mode?", "Many vehicles are GTA Online only (Oppressor Mk II, Kosatka).", "Check availability: STORY_MODE, ONLINE_ONLY, BOTH or UNKNOWN.", "Use a Story Mode vehicle from the catalog or cheats; if the entry says ONLINE_ONLY it does not exist in the Story Mode.", "All versions", "Rockstar (mode separation); GamePressure; Grand Theft Wiki.") },
    { kind: "matrix", title: "Stock market not profitable", status: "unverified", text: row(8, "I didn't make money from the assassination stocks.", "Stock behaviour differs by version, timing was off, or the guide's percentages are optimistic.", "Compare your buy and sell timing with the strategy entry.", "Use separate save slots and retry; returns quoted by guides are claims.", "PS4/PS5/PC differ", "GTABase.") },
  ],
});

/* ───────────────────────────── locations (extra) + regions ───────────────────────────── */
const locNoCoord = (id: string, name: string, region: string, district: string, summary: string, aliases: string[] = [], src: Ent["sources"] = [gtw("Missions_in_GTA_V", 0.7)]): Ent => ({
  id: `location:${id}`, type: "location", name, aliases, summary, verification: "curated", confidence: 0.65, sources: src,
  attrs: { kind: "mission location" }, location: { region, district, coord_precision: "unknown", external_map_url: IGN_MAP },
  relations: [{ predicate: "located_in", to: region === "Los Santos" ? "location:los-santos" : "location:blaine-county" }],
});
const locations: Ent[] = [
  {
    id: "location:los-santos", type: "location", name: "Los Santos", aliases: ["Los Santos city", "cidade de Los Santos"], summary: "The main city of San Andreas, in the south: home to Michael's and Franklin's residences, downtown, the port and the airport.",
    verification: "curated", confidence: 0.7, sources: [gw("Los_Santos", 0.7)], attrs: { kind: "region" }, location: { region: "Los Santos", district: "Los Santos", game_x: 0, game_y: -1000, coord_precision: "approximate", external_map_url: IGN_MAP },
  },
  {
    id: "location:blaine-county", type: "location", name: "Blaine County", aliases: ["Blaine", "condado de Blaine"], summary: "The rural county north of Los Santos: Sandy Shores, Grapeseed, Paleto Bay, Mount Chiliad and Fort Zancudo.",
    verification: "curated", confidence: 0.7, sources: [gw("Blaine_County", 0.7)], attrs: { kind: "region" }, location: { region: "Blaine County", district: "Blaine County", game_x: 500, game_y: 4500, coord_precision: "approximate", external_map_url: IGN_MAP },
  },
  locNoCoord("premium-deluxe-motorsport", "Premium Deluxe Motorsport", "Los Santos", "Pillbox Hill", "Simeon Yetarian's car dealership in Pillbox Hill where Franklin works; a location of the mission Complications.", ["Simeon's dealership", "concessionária do Simeon"]),
  locNoCoord("lifeinvader-offices", "Lifeinvader offices", "Los Santos", "Los Santos", "The Lifeinvader offices, location of the mission Friend Request.", ["Lifeinvader"]),
  locNoCoord("darnell-bros-garment-factory", "Darnell Bros. garment factory", "Los Santos", "La Mesa", "Lester's garment factory on Popular Street in La Mesa, used in Casing the Jewel Store and several heist setups.", ["Lester's factory", "fábrica do Lester"]),
  locNoCoord("maze-bank-arena", "Maze Bank Arena", "Los Santos", "Los Santos", "The arena where Tracey's audition takes place in the mission Fame or Shame.", ["Maze Bank Arena"]),
  locNoCoord("von-crastenburg-hotel", "Von Crastenburg Hotel", "Los Santos", "Rockford Hills", "The hotel in Rockford Hills where Franklin makes the Hotel Assassination hit.", ["Von Crastenburg"]),
  locNoCoord("richards-majestic", "Richards Majestic film studio", "Los Santos", "Rockford Hills", "Solomon Richards' film studio in Rockford Hills, used in Deep Inside, Mr. Richards and The Ballad of Rocco.", ["Richards Majestic", "Backlot City"]),
  locNoCoord("vanilla-unicorn", "Vanilla Unicorn", "Los Santos", "Strawberry", "The strip club in Strawberry that Trevor takes over in Hang Ten; Lester plans the Big Score there.", ["Vanilla Unicorn strip club"]),
  locNoCoord("mile-high-club-site", "Mile High Club construction site", "Los Santos", "Pillbox Hill", "The construction site in Pillbox Hill where Franklin gets the FIB blueprints in Architect's Plans.", ["Mile High Club"]),
  locNoCoord("kortz-center", "Kortz Center", "Los Santos", "Los Santos", "The location of The Wrap Up, a late-game mission.", ["Kortz"]),
  {
    id: "location:sonar-collections-dock", type: "location", name: "Sonar Collections Dock", aliases: ["Sonar dock location"], verification: "unverified", confidence: 0.4,
    summary: "The dock business (about $250,000) where the Story Mode submarine and the underwater collectibles are unlocked. Its exact district and map position are not validated yet.",
    sources: [gp("unique-vehicles/ze55bb", 0.6)], attrs: { kind: "property site" }, location: { coord_precision: "unknown", external_map_url: IGN_MAP },
  },
];

const characters: Ent[] = [
  { id: "character:tao-cheng", type: "character", name: "Tao Cheng", aliases: ["Tao"], summary: "Tao Cheng gives Trevor the missions Trevor Philips Industries and Crystal Maze.", verification: "curated", confidence: 0.6, sources: [gw("Tao_Cheng", 0.6), gtw("Crystal_Maze", 0.75)], attrs: { role: "mission giver", playable: false } },
  { id: "character:stretch", type: "character", name: "Stretch", aliases: [], summary: "Stretch is an associate of Lamar who takes part in The Long Stretch.", verification: "curated", confidence: 0.6, sources: [gw("Stretch", 0.6), gtw("The_Long_Stretch", 0.75)], attrs: { role: "Lamar's associate", playable: false } },
  { id: "character:molly-schultz", type: "character", name: "Molly Schultz", aliases: ["Molly"], summary: "Molly Schultz works with Solomon Richards and appears in Deep Inside and Legal Trouble.", verification: "curated", confidence: 0.6, spoiler_level: 2, sources: [gtw("Legal_Trouble", 0.75), gtw("Deep_Inside", 0.75)], attrs: { role: "film-industry associate", playable: false } },
  { id: "character:ferdinand-kerimov", type: "character", name: "Ferdinand Kerimov", aliases: ["Kerimov"], summary: "Ferdinand Kerimov is the target the protagonists snatch in Three's Company and interrogate in By the Book.", verification: "curated", confidence: 0.6, sources: [gtw("Three's_Company", 0.75), gtw("By_the_Book", 0.75)], attrs: { role: "mission target", playable: false } },
  { id: "character:lazlow-jones", type: "character", name: "Lazlow Jones", aliases: ["Lazlow"], summary: "Lazlow Jones is the host of the talent show in the mission Fame or Shame.", verification: "curated", confidence: 0.6, sources: [gtw("Fame_or_Shame_(mission)", 0.75)], attrs: { role: "talent-show host", playable: false } },
  { id: "character:floyd-hebert", type: "character", name: "Floyd Hebert", aliases: ["Floyd"], summary: "Floyd Hebert is Wade's cousin and takes part in Scouting the Port.", verification: "curated", confidence: 0.6, sources: [gtw("Scouting_the_Port", 0.75)], attrs: { role: "Trevor's associate", playable: false } },
];

/* ───────────────────────────── backlog ───────────────────────────── */
const backlog = [
  { topic: "Mission money rewards", note: "Cash rewards were 'not listed' on almost every mission page checked; per-mission rewards are not recorded." },
  { topic: "Getaway Vehicle setups", note: "The three Getaway Vehicle setups (Blitz Play, Bureau Raid, Big Score) have no usable page on any accessible source. Prologue, Masks, Trevor Philips Industries and Meltdown now come from GTA5Wiki only and conflict with Grand Theft Wiki (recorded as UNVERIFIED)." },
  { topic: "Unlock chains", note: "Page-derived unlock chains conflict in places (e.g. Hood Safari vs Blitz Play, Scouting the Port). They are stored as UNVERIFIED; reconcile with an in-game test or a second source." },
  { topic: "Missable status", note: "No source checked states whether any main mission is missable; not recorded." },
  { topic: "Heist payouts per crew combination", note: "Only maximum/approximate payouts are recorded; the Bureau Raid payout is not confirmed and the Big Score total (≈$201M) is single-source." },
  { topic: "Merryweather Heist details", entity_id: "heist:merryweather-heist", note: "Crew members per approach and exact setup order are not validated." },
  { topic: "Console cheats", entity_id: "cheat:cheats-overview", note: "PlayStation and Xbox button sequences are not recorded: the only text found was inconsistent between pages. Phone numbers are recorded only where they match the keypad spelling of the PC code." },
  { topic: "Vehicle statistics", note: "Speed, acceleration, handling and price rankings are not validated; no 'fastest vehicle' answer is possible." },
  { topic: "Weapon statistics", note: "No 'best weapon' ranking exists in the sources. Accuracy, range, fire rate, reload, price and shop/location are not recorded; damage/magazine from GTA5Wiki are stored UNVERIFIED because that site mixes Online weapons and contradicts itself." },
  { topic: "Railgun in Story Mode", entity_id: "weapon:railgun", note: "Sources disagree; needs verification, probably per game version." },
  { topic: "Collectible locations", note: "Per-item locations (letter scraps, spaceship parts, submarine pieces, nuclear waste, peyote, monkey mosaics, epsilon tracts, hidden packages) are not recorded." },
  { topic: "Collectible totals", note: "Submarine Pieces (30), Epsilon Tracts (10) and Hidden Packages (12) come from GTA5Wiki and are consistent with GamePressure where it states anything, but are single-site." },
  { topic: "Stranger chains not documented", note: "Abigail, Josh, Cletus, Rampages, Mrs. Philips, The Last One, Hao's Shift Work and Dom/Beverly details: sources conflict or are incomplete." },
  { topic: "Strangers 100% count", entity_id: "completion:100-percent", note: "Headline requirement (20) vs sum of listed Franklin chains (24) not reconciled." },
  { topic: "Random events", entity_id: "random_event:random-events-overview", note: "Per-event location, protagonist, reward, repeatability are not recorded (only names)." },
  { topic: "Hobbies by protagonist", entity_id: "hobby:hobbies-and-pastimes", note: "Which protagonist can do each hobby; hunting and other activities outside the 100% list." },
  { topic: "Properties", entity_id: "property:safehouses-overview", note: "Full price/income/protagonist table; only the Sonar Collections Dock price is corroborated." },
  { topic: "Post-story money", entity_id: "game_mechanic:money-overview", note: "Best money methods after the story; stock returns by version." },
  { topic: "Version differences", entity_id: "version:editions-overview", note: "PC Enhanced vs Legacy and per-platform content differences." },
  { topic: "Verified coordinates", note: "All map positions are approximate (project coordinate system); mission locations without a mapped entity have no coordinates." },
  { topic: "IGN guides", note: "ign.com cannot be fetched by the automated tool and was not circumvented; IGN-based facts are not included." },
  { topic: "Fandom (GTA Wiki)", note: "gta.fandom.com is behind a bot challenge; its pages are linked but their content was not ingested." },
];

write("entities-completion.json", completion);
write("entities-strangers.json", strangers);
write("entities-hobbies.json", hobbies);
write("entities-properties.json", properties);
write("entities-random-events.json", randomEvents);
write("entities-money.json", money);
write("entities-versions.json", versions);
write("entities-cheats-overview.json", cheats);
write("entities-troubleshooting.json", troubleshooting);
write("entities-locations-2.json", locations);
write("entities-characters-2.json", characters);
write("backlog.json", backlog);
