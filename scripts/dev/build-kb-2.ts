/**
 * Phase-2 knowledge: heists, collectibles, vehicles, weapons, Online boundary.
 * Sources fetched 2026-10-06 (Grand Theft Wiki, GamePressure, GTABase, Destructoid, GTAIntel). IGN could not be fetched
 * automatically (blocked) and Fandom sits behind a bot challenge — neither was circumvented.
 *
 * Status policy: verified = ≥2 independent sites agree · curated = one site / author knowledge · unverified = conflicting or weak.
 * Strategy advice is labelled as opinion. Anything missing goes to backlog (build-kb-3.ts), never invented.
 */
import { type Ent, GB_100, IGN_MAP, ds, g5w, gb, gi, gp, gtw, gw, rs, write } from "./data/helpers";

const GTW_JSJ = gtw("The_Jewel_Store_Job", 0.8);
const DS_PAYOUT = "https://www.destructoid.com/gta-v-guide-how-get-maximum-possible-share-each-heist/";
const GI_CREW = "https://gtaintel.com/news/gta-5-heists-complete-crew-guide";
const GB_BIG = "https://gtabase.com/grand-theft-auto-v/missions/planning-the-big-score";
const GP5W = { source: "gta5wiki", url: "https://gta5wiki.com/missions/story/", confidence: 0.6, retrieved_at: "2026-10-06" };

/* ───────────────────────────── heists ───────────────────────────── */
const heists: Ent[] = [
  {
    id: "heist:jewel-store-job", type: "heist", name: "The Jewel Store Job", aliases: ["Jewel Store Job", "Jewel Store", "Jewelry Store Job", "joalheria", "assalto à joalheria"],
    summary: "Michael's first heist, with Franklin and planner Lester: the Vangelico jewellery store. Two approaches: Smart (gas) and Loud. Maximum gross take is $4,946,153, from which Martin Madrazo is paid $2,500,000.",
    sources: [GTW_JSJ, ds(DS_PAYOUT), GP5W, gw("The_Jewel_Store_Job")], verification: "curated", confidence: 0.85,
    attrs: { approaches: ["Smart", "Loud"], setup_missions: ["Casing the Jewel Store", "Carbine Rifles (Loud)", "Bugstars Equipment (Smart)", "BZ Gas Grenades (Smart)"], max_gross_take: 4946153, madrazo_payoff: 2500000 },
    sections: [
      { kind: "walkthrough", title: "Plan (Approach A: Smart / Approach B: Loud)", status: "curated", text: "Step 1: do Friend Request, then Casing the Jewel Store (Michael, garment factory in La Mesa). Step 2, Approach A (Smart): Bugstars Equipment then BZ Gas Grenades. Step 2, Approach B (Loud): Carbine Rifles. Step 3: also do the Masks setup if it appears (its heist is disputed). Step 4: choose gunman, driver and hacker (see crew cuts). Step 5: start the heist at the Vangelico store in Rockford Plaza. Condition: the crew you hire changes your cut and the chance of mistakes." },
      { kind: "approaches", title: "Smart vs Loud", status: "curated", text: "Both approaches start with Casing the Jewel Store. Loud adds Carbine Rifles and is a direct armed entry; Smart adds Bugstars Equipment and BZ Gas Grenades and uses gas dropped through a vent to incapacitate the people inside." },
      { kind: "money", title: "Payout", status: "verified", text: "The maximum gross take is $4,946,153 (three sites agree). From that, $2,500,000 goes to Martin Madrazo, leaving a maximum net take of $2,446,153 (Grand Theft Wiki); the same page gives Michael's maximum cut as $1,223,073 and Franklin's as $293,593 (12%)." },
      { kind: "crew", title: "Crew (cuts as listed by Grand Theft Wiki)", status: "curated", text: "Gunmen: Gustavo Mota 14%, Packie McReary 12%, Norm Richards 10.5% (his role is scripted to crash and may lose diamonds). Drivers: Eddie Toh 14%, Karim Denz 8%. Hackers: Paige Harris 15%, Christian Feltz 10%, Rickie Lukens 4%." },
      { kind: "strategy", title: "Which crew? (opinion, guides disagree)", status: "unverified", src: 1, text: "The guides disagree. GTAIntel recommends Karim Denz (driver) + Norm Richards (gunman) with the Smart approach for a balanced cut; Destructoid's maximum-payout route uses Rickie Lukens (hacker), Packie McReary (gunman) and Karim Denz (driver). Better-skilled crew take a larger cut but make fewer mistakes." },
      { kind: "consequences", title: "Unlocks", status: "curated", text: "Completing the heist unlocks the mission Mr. Philips. Per Grand Theft Wiki, switching between Michael and Franklin is unavailable afterwards until Friends Reunited is completed." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:vangelico-jewelry-store" }, { predicate: "involves", to: "character:lester-crest" }, { predicate: "related_to", to: "character:martin-madrazo" }],
  },
  {
    id: "heist:merryweather-heist", type: "heist", name: "The Merryweather Heist", aliases: ["Merryweather Heist", "Merryweather", "assalto Merryweather"],
    summary: "Trevor leads Michael and Franklin in stealing an experimental device from Merryweather at the Port of Los Santos. Approaches: Freighter (Minisub setup) and Offshore (Cargobob setup). The device has to be handed back, so the crew keeps no payout.",
    sources: [gtw("The_Merryweather_Heist", 0.75), gtw("Missions_in_GTA_V", 0.9)], verification: "curated", confidence: 0.8,
    attrs: { approaches: ["Freighter", "Offshore"], setup_missions: ["Scouting the Port", "Minisub (Freighter)", "Cargobob (Offshore)"] },
    sections: [
      { kind: "walkthrough", title: "Plan (Approach A: Freighter / Approach B: Offshore)", status: "curated", text: "Step 1: Scouting the Port as Trevor (port of Los Santos, disguised as a dock worker). Step 2, Approach A (Freighter): Minisub. Step 2, Approach B (Offshore): Cargobob at Fort Zancudo. Step 3: run The Merryweather Heist. Condition: the device has to be handed back, so no cash is kept." },
      { kind: "approaches", title: "Freighter vs Offshore", status: "curated", text: "Scouting the Port comes first. The Freighter approach uses the Minisub setup; the Offshore approach uses the Cargobob setup (the Cargobob mission page says it is only needed for Offshore)." },
      { kind: "money", title: "Payout", status: "curated", text: "Grand Theft Wiki says the device would have been worth $20 million, but it has to be returned, so the heist yields no payout; Destructoid also treats it as botched with no crew optimisation possible." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:port-of-los-santos" }],
  },
  {
    id: "heist:blitz-play", type: "heist", name: "Blitz Play", aliases: ["Blitz Play heist", "ambush Securicar", "Blitz Play mission"],
    summary: "Michael, Franklin and Trevor ambush a Securicar carrying bonds using a Trashmaster and a tow truck, then hold off the LSPD. Steve Haines is the mission giver. There is no crew choice and no cash payout is listed.",
    sources: [gtw("Blitz_Play", 0.85), ds(DS_PAYOUT)], verification: "curated", confidence: 0.85,
    attrs: { approaches: [], setup_missions: ["Trash Truck", "Boiler Suits", "Masks", "Tow Truck", "Getaway Vehicle (Blitz Play)"] },
    sections: [
      { kind: "walkthrough", title: "Plan (single approach)", status: "curated", text: "Step 1: complete The Merryweather Heist. Step 2: do the setups Trash Truck (Mirror Park), Boiler Suits (Ammu-Nation, Strawberry), Masks, Tow Truck (La Puerta) and Getaway Vehicle. Step 3: Blitz Play: block the street with the Trashmaster, take the Securicar with the tow truck, hold off the LSPD. Condition: there is no crew choice and no cash payout is listed." },
      { kind: "requirements", title: "How it unlocks", status: "curated", text: "Finish The Merryweather Heist, then complete the five setup missions given by Michael: Trash Truck, Boiler Suits, Masks, Tow Truck and Getaway Vehicle (Blitz Play). Steve Haines then gives Blitz Play. (A Hood Safari page claims to unlock it as well — the pages disagree.)" },
      { kind: "money", title: "Payout", status: "curated", text: "Destructoid lists Blitz Play as having no monetary payout; the Grand Theft Wiki page lists no cash reward either." },
    ],
  },
  {
    id: "heist:paleto-score", type: "heist", name: "The Paleto Score", aliases: ["Paleto Score", "Paleto Bay bank heist", "assalto ao banco de Paleto"],
    summary: "Michael, Franklin and Trevor rob the Blaine County Savings Bank in Paleto Bay and fight off police and military. Setup missions: Paleto Score Setup and Military Hardware. Maximum take $8,016,020, split among the crew.",
    sources: [gtw("The_Paleto_Score", 0.8), GP5W, ds(DS_PAYOUT)], verification: "curated", confidence: 0.85,
    attrs: { approaches: [], setup_missions: ["Paleto Score Setup", "Military Hardware"], max_take: 8016020 },
    sections: [
      { kind: "walkthrough", title: "Plan (single approach)", status: "curated", text: "Step 1: Paleto Score Setup (Michael and Trevor scout the Blaine County Savings Bank with Lester). Step 2: Military Hardware (intercept a military convoy near Harmony). Step 3: hire one gunman. Step 4: The Paleto Score at the Paleto Bay bank. Condition: Daryl Johns or Norm Richards may die if hired." },
      { kind: "money", title: "Payout", status: "verified", text: "The maximum take is $8,016,020 (Grand Theft Wiki and GTA5Wiki agree), subject to losses from gunfire. Grand Theft Wiki lists $444,206 for each protagonist and $210,414 each for the gunman and Lester; Destructoid gives a range of roughly $425,000–$464,000 per character depending on performance." },
      { kind: "crew", title: "Crew", status: "curated", text: "One gunman is chosen from Daryl Johns, Norm Richards, Packie McReary, Chef or Gustavo Mota; Lester handles the escape boat. Daryl Johns or Norm Richards can die if chosen." },
      { kind: "gold", title: "Gold Medal / secondary objectives", status: "curated", text: "Gold-medal time limit 16 minutes; secondary objectives include firing over 4,000 bullets, 50%+ accuracy and causing $1,000,000+ of damage in Paleto Bay." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:paleto-bank" }],
  },
  {
    id: "heist:bureau-raid", type: "heist", name: "The Bureau Raid", aliases: ["Bureau Raid", "FIB raid", "invasão ao FIB"],
    summary: "Michael and Franklin raid the FIB building for Steve Haines to destroy evidence. Two approaches: covert (Fire Crew, with the Fire Truck setup) and Roof (assault). Payout figures disagree between sources.",
    sources: [gtw("The_Bureau_Raid", 0.8), ds(DS_PAYOUT)], verification: "curated", confidence: 0.75,
    attrs: { approaches: ["Fire Crew (covert)", "Roof"], setup_missions: ["Cleaning Out the Bureau", "Architect's Plans", "Fire Truck (Fire Crew)", "Getaway Vehicle (Bureau Raid)"] },
    sections: [
      { kind: "walkthrough", title: "Plan (Approach A: Fire Crew / Approach B: Roof)", status: "curated", text: "Step 1: Cleaning Out the Bureau (follow the janitor), Reuniting the Family, then Architect's Plans (Franklin, Mile High Club site). Step 2, Approach A (Fire Crew): Fire Truck and Getaway Vehicle, two gunmen. Step 2, Approach B (Roof): NOOSE gear, pilot, gunman, hacker and driver. Step 3: The Bureau Raid at the FIB building. Condition: approach names differ between pages (Covert / Fire Crew; Roof)." },
      { kind: "approaches", title: "Covert (Fire Crew) vs Roof", status: "curated", text: "Grand Theft Wiki lists a Covert approach (setups: Architect's Plans, Fire Truck, Getaway Vehicle; two gunmen) and a Roof approach (Architect's Plans plus NOOSE equipment; crew: pilot, gunman, hacker and driver). The Fire Truck mission page calls the covert route the Fire Crew approach." },
      { kind: "gold", title: "Secondary objectives", status: "curated", text: "Covert: finish within 18:00, escape with 40% oxygen, finish the mopping within 3 minutes, abseil down the elevator shaft within 30 seconds. Roof: finish within 19:00, no civilian casualties, 20+ headshots, 70%+ accuracy, perfect roof landing, hack within 45 seconds." },
      { kind: "money", title: "Payout", status: "unverified", text: "The Grand Theft Wiki page gives no payout. Destructoid quotes about $240,000 for Franklin with its crew; other sources quote different figures. Treat the payout as unconfirmed." },
      { kind: "consequences", title: "Unlocks", status: "curated", text: "Completing it leads to The Wrap Up." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:fib-building" }],
  },
  {
    id: "heist:big-score", type: "heist", name: "The Big Score", aliases: ["Big Score", "grande golpe", "final heist", "último assalto"],
    summary: "The final heist: the Union Depository job planned in Planning the Big Score. Subtle (Stingers + Gauntlet; needs a hacker) or Obvious (Driller + Sidetracked). Guides quote 40+ million dollars per protagonist with an optimised crew.",
    sources: [gtw("Planning_the_Big_Score", 0.8), gb(GB_BIG, 0.7), ds(DS_PAYOUT), gi(GI_CREW)], verification: "curated", spoiler_level: 2, confidence: 0.8,
    attrs: { approaches: ["Subtle", "Obvious"], setup_missions: ["Planning the Big Score", "Stingers (Subtle)", "Gauntlet (Subtle)", "Driller (Obvious)", "Sidetracked (Obvious)", "Getaway Vehicle (Big Score)"] },
    sections: [
      { kind: "walkthrough", title: "Plan (Approach A: Subtle / Approach B: Obvious)", status: "curated", text: "Step 1: Surveying the Score and Planning the Big Score (Vanilla Unicorn). Step 2, Approach A (Subtle): Stingers (Davis police station) and Gauntlet; hire 2 gunmen, 2 drivers and a hacker. Step 2, Approach B (Obvious): Driller (La Mesa) and Sidetracked (Davis Quartz train station); hire 2 gunmen and 2 drivers. Step 3: Getaway Vehicle. Step 4: The Big Score at the Union Depository. Condition: sources disagree on which approach pays more." },
      { kind: "approaches", title: "Subtle vs Obvious", status: "verified", src: 1, text: "Subtle: intercept Securicars posing as Gruppe 6 guards and move the gold into modified Gauntlets; it needs 2 gunmen, 2 drivers and a hacker. Obvious: create a diversion while drilling up to the vault and extract the gold by helicopter to a train; it needs 2 gunmen and 2 drivers (no hacker). Grand Theft Wiki and GTABase agree on these crew requirements." },
      { kind: "money", title: "Payout", status: "curated", src: 2, text: "Two guides state that an optimised crew yields over $41 million per protagonist; GTAIntel puts the total at about $201 million. The figures are approximate and depend on crew cuts and performance." },
      { kind: "crew", title: "Crew cuts (sample)", status: "curated", src: 1, text: "GTABase lists Taliana Martinez (driver) 5%, Daryl Johns (gunman) 6%, Karim Denz (driver) 8% and Paige Harris (hacker) 15%. GTAIntel says Taliana is unlocked via a side mission." },
      { kind: "strategy", title: "Which approach pays more? (opinion, guides disagree)", status: "unverified", src: 1, text: "GTABase argues Obvious yields the highest revenue because crew costs are lower and Subtle needs a $300,000 bribe; GTAIntel recommends Subtle with Paige Harris. The sources diverge, so this is an open opinion question." },
    ],
    relations: [{ predicate: "related_to", to: "game_mechanic:heist-crew" }, { predicate: "takes_place_at", to: "location:union-depository" }],
  },
];

/* ───────────────────────────── collectibles ───────────────────────────── */
const collectibles: Ent[] = [
  {
    id: "collectible:letter-scraps", type: "collectible", name: "Letter Scraps", aliases: ["Letter Scrap", "pedaços de carta", "cartas rasgadas"],
    summary: "50 letter scraps (pieces of a torn letter) are scattered around San Andreas. They tie into the Franklin stranger mission A Starlet in Vinewood. Collecting all 50 is one of the required miscellaneous activities for 100%.",
    sources: [gtw("Letter_Scraps", 0.8), gb(GB_100, 0.7)], verification: "verified", confidence: 0.85,
    attrs: { kind: "Letter Scraps", total: 50, counts_for_100: true, related_mission: "A Starlet in Vinewood", character: "Franklin", reward: "Unlocks the mission A Starlet in Vinewood's resolution; no direct cash reward documented" },
    sections: [{ kind: "completion", title: "100% relevance", status: "curated", text: "GTABase lists 'Collect 50 letter scraps' among the 16 required miscellaneous activities." }, { kind: "reward", title: "Reward (single source)", status: "unverified", text: "GTA5Wiki lists a $50,000 reward tied to completing the murder-mystery strand; Grand Theft Wiki and GamePressure state no reward, so this is unconfirmed." }],
    relations: [{ predicate: "related_to", to: "completion:100-percent" }],
  },
  {
    id: "collectible:spaceship-parts", type: "collectible", name: "Spaceship Parts", aliases: ["Spaceship Part", "peças da nave", "peças de nave espacial"],
    summary: "50 spaceship parts. You first need to finish the Franklin stranger mission Omega; once all parts are found and returned, the Space Docker becomes available in Omega's garage.",
    sources: [gtw("Space_Docker", 0.8), gp("spaceship-parts/z45573", 0.7), gb(GB_100, 0.7)], verification: "verified", confidence: 0.85,
    attrs: { kind: "Spaceship Parts", total: 50, counts_for_100: true, reward: "Space Docker", reward_location: "Omega's garage", prerequisite: "Omega stranger mission (Franklin)" },
    sections: [
      { kind: "requirements", title: "Unlock and reward", status: "verified", text: "GamePressure says you must first finish the secondary mission 'Omega' to unlock the parts (only Franklin can start it, though all three protagonists can collect parts). Grand Theft Wiki and GamePressure's vehicle list agree that collecting all 50 parts gives the Space Docker in Omega's garage." },
      { kind: "completion", title: "100% relevance", status: "curated", text: "GTABase lists collecting 50 spaceship parts among the 16 required miscellaneous activities. GamePressure mentions the achievement/trophy 'From Beyond the Stars' for returning all parts to Omega." },
    ],
    relations: [{ predicate: "rewards", to: "vehicle:space-docker" }, { predicate: "related_to", to: "completion:100-percent" }],
  },
  {
    id: "collectible:submarine-pieces", type: "collectible", name: "Submarine Pieces", aliases: ["Submarine Parts", "peças do submarino"],
    summary: "Underwater submarine parts that become available after buying the Sonar Collections Dock ($250,000). GTA5Wiki lists 30 pieces and a Kraken submersible as the reward, tied to an Abigail Mathers strand, which conflicts with GamePressure (Michael, purchase-driven); the character and the reward are therefore unconfirmed.",
    sources: [gp("submarine-parts/z7566f", 0.55), g5w("collectibles/", 0.5)], verification: "unverified", confidence: 0.5,
    attrs: { kind: "Submarine Pieces", total: 30, requirement: "Buy the Sonar Collections Dock", reward: "A submersible (named Kraken by GTA5Wiki; GamePressure states no reward)", note_total: "30 per GTA5Wiki; GamePressure states no total" },
    sections: [{ kind: "requirements", title: "How it starts", status: "curated", text: "GamePressure says a boat with diving equipment appears at the docks when the mission starts and parts are found by diving to marked spots (a shrinking white circle shows proximity). It names the mission 'Death at Sea' and says it is for Michael, which conflicts with another wiki listing it under a Franklin stranger — treat the character as unconfirmed." }],
    relations: [{ predicate: "requires", to: "property:sonar-collections-dock" }],
  },
  {
    id: "collectible:nuclear-waste", type: "collectible", name: "Nuclear Waste", aliases: ["Nuclear Waste barrels", "Radioactive Waste", "lixo nuclear"],
    summary: "30 yellow biohazard barrels dumped underwater. After buying the Sonar Collections Dock you use a Trackify app as a radar; GamePressure lists about $23,000 per barrel and a $250,000 bonus when all are collected.",
    sources: [gp("radioactive-waste/ze55c1", 0.65)], verification: "curated", confidence: 0.65,
    attrs: { kind: "Nuclear Waste", total: 30, requirement: "Buy the Sonar Collections Dock", reward: "$23,000 per barrel and $250,000 when all are collected (single source)" },
    relations: [{ predicate: "requires", to: "property:sonar-collections-dock" }],
  },
  {
    id: "collectible:hidden-packages", type: "collectible", name: "Hidden Packages", aliases: ["Hidden Package", "pacotes escondidos"],
    summary: "Hidden packages exist in GTA V Story Mode: GTA5Wiki lists 12, and GamePressure shows roughly a dozen cash values on its map. Almost all are underwater (ship or plane wrecks) and contain cash and, per GTA5Wiki, sometimes weapons.",
    sources: [gp("hidden-packages/z4566c", 0.55), g5w("collectibles/", 0.5)], verification: "curated", confidence: 0.55,
    attrs: { kind: "Hidden Packages", total: 12, reward: "Cash (listed values $7,500 to $25,000) and occasionally weapons", requirement: "Diving gear (bathyscaphe or boat with diving equipment) is recommended" },
    sections: [{ kind: "details", title: "What the guide says", status: "curated", text: "Cash values quoted for individual packages range from $7,500 to $25,000. One package requires bringing 3 hitchhikers to the Altruist camp. Diving gear (a bathyscaphe or a boat with diving equipment) is recommended. The total count is not stated; do not assume one." }],
  },
  {
    id: "collectible:epsilon-tracts", type: "collectible", name: "Epsilon Tracts", aliases: ["Epsilon Tract", "tratados Epsilon"],
    summary: "Epsilon Tracts are collected after Michael completes the eight Epsilon Program missions. Marnie sends a message with a link to a long text, the Epsilon Tract of the 9th Paradigm, as the reward. The total is 10 according to GTA5Wiki.",
    sources: [gp("epsilon-tracts/z3566b", 0.6), g5w("collectibles/", 0.5)], verification: "curated", confidence: 0.6,
    attrs: { kind: "Epsilon Tracts", total: 10, note_total: "10 per GTA5Wiki; GamePressure states no total", character: "Michael", reward: "Access to the Epsilon Tract of the 9th Paradigm text" },
    sections: [{ kind: "requirements", title: "Requirements", status: "curated", text: "Per GamePressure the eight missions are Seeking the Truth, Accepting the Truth, Assuming the Truth, Chasing the Truth, Bearing the Truth, Delivering the Truth, Exercising the Truth and Unknowing the Truth; SMS messages give hints about tract locations." }],
  },
  {
    id: "collectible:monkey-mosaics", type: "collectible", name: "Monkey Mosaics", aliases: ["Monkey Mosaic", "mosaicos de macaco"],
    summary: "50 Monkey Mosaics to photograph, available in the versions on newer consoles and PC. Photographing them all rewards a monkey disguise and a monkey-livery car in your garage.",
    sources: [gp("monkey-mosaics-images/z2716d", 0.6)], verification: "curated", confidence: 0.6, versions: ["PS4/Xbox One", "PS5/Xbox Series", "PC"],
    attrs: { kind: "Monkey Mosaics", total: 50, reward: "Monkey disguise and a monkey-graphics car", availability: "Not in the PS3/Xbox 360 versions (per GamePressure: new consoles and PC)" },
    sections: [{ kind: "versions", title: "Version availability", status: "curated", versions: ["PS4/Xbox One", "PS5/Xbox Series", "PC"], text: "GamePressure describes this task as applying to the re-release on newer consoles and PC. Franklin is told about it after completing Chop, but all three protagonists can photograph mosaics. Whether it is in PC Legacy and PC Enhanced alike is not confirmed." }],
  },
  {
    id: "collectible:peyote-plants", type: "collectible", name: "Peyote Plants", aliases: ["Peyote", "Peyote Plant", "peiote", "plantas de peiote"],
    summary: "27 peyote plants, exclusive to the PS4, Xbox One and PC versions and later. Eating one triggers a hallucination in which you play as a random Land, Sea or Air animal; the plants respawn after collection.",
    sources: [gtw("Peyote_Plants", 0.8)], verification: "curated", versions: ["PS4/Xbox One", "PS5/Xbox Series", "PC"], confidence: 0.8,
    attrs: { kind: "Peyote Plants", total: 27, availability: "Not in the PS3/Xbox 360 versions", counts_for_100: false },
    sections: [{ kind: "completion", title: "100% relevance", status: "curated", text: "GTABase lists enhanced-edition exclusives among the things NOT required for 100% completion." }],
  },
  {
    id: "collectible:rampages", type: "collectible", name: "Rampages", aliases: ["Rampage", "rampage missions", "Red Mist"],
    summary: "5 Rampage challenges, playable only by Trevor according to GTA5Wiki; completing them earns the Red Mist trophy/achievement. Grand Theft Wiki's stranger table assigned them to Franklin, so the protagonist is disputed.",
    sources: [g5w("collectibles/", 0.5), gtw("Strangers_and_Freaks", 0.5)], verification: "unverified", confidence: 0.45,
    attrs: { kind: "Rampages", total: 5, character: "Trevor (GTA5Wiki) vs Franklin (Grand Theft Wiki)" },
    sections: [{ kind: "conflict", title: "Sources disagree", status: "unverified", text: "Source A (GTA5Wiki): Rampages are Trevor-only. Source B (Grand Theft Wiki stranger table): Franklin. Difference: which protagonist can play them. Confidence in either: about 40%. The sources diverge." }],
  },
  {
    id: "collectible:stunt-jumps", type: "collectible", name: "Stunt Jumps", aliases: ["Stunt Jump", "saltos acrobáticos"],
    summary: "50 stunt jumps; 25 of them are required for 100% completion.",
    sources: [gb(GB_100, 0.65), gw("Stunt_Jumps", 0.5)], verification: "curated", confidence: 0.65,
    attrs: { kind: "Stunt Jumps", total: 50, counts_for_100: true, required_for_100: 25 },
  },
  {
    id: "collectible:knife-flights", type: "collectible", name: "Knife Flights", aliases: ["Knife Flight", "voos de faca"],
    summary: "15 knife flights (flying a plane through narrow gaps); 8 of them are required for 100% completion.",
    sources: [gb(GB_100, 0.65), gw("Knife_Flights", 0.5)], verification: "curated", confidence: 0.65,
    attrs: { kind: "Knife Flights", total: 15, counts_for_100: true, required_for_100: 8 },
  },
  {
    id: "collectible:under-the-bridge", type: "collectible", name: "Under the Bridge", aliases: ["Under the Bridge challenge", "passar por baixo das pontes"],
    summary: "50 bridges to pass under (by plane); 25 of them are required for 100% completion.",
    sources: [gb(GB_100, 0.65), gw("Under_the_Bridge", 0.5)], verification: "curated", confidence: 0.65,
    attrs: { kind: "Under the Bridge", total: 50, counts_for_100: true, required_for_100: 25 },
  },
];

/* ───────────────────────────── vehicles ───────────────────────────── */
const UV = gp("unique-vehicles/ze55bb", 0.6);
const CHEAT_PAGE = gtw("Cheats_in_GTA_V", 0.85);
const veh = (id: string, name: string, over: Partial<Ent> & { attrs: Ent["attrs"] }): Ent => ({
  id: `vehicle:${id}`, type: "vehicle", name, aliases: [], summary: "", sources: [UV], verification: "curated", confidence: 0.6, ...over,
});
const vehicles: Ent[] = [
  veh("space-docker", "Space Docker", {
    aliases: ["Docker espacial", "nave espacial"], summary: "A special vehicle obtained by collecting all 50 spaceship parts; it becomes available in Omega's garage. Two independent sources agree.",
    sources: [gtw("Space_Docker", 0.8), UV], verification: "verified", confidence: 0.85,
    attrs: { category: "special", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Collect all 50 Spaceship Parts, then use the Omega stranger chain", location_detail: "Omega's garage (exact coordinates not validated)" },
    relations: [{ predicate: "requires", to: "collectible:spaceship-parts" }],
  }),
  veh("buzzard", "Buzzard", { aliases: ["Buzzard Attack Chopper", "Nagasaki Buzzard"], summary: "A Nagasaki attack helicopter. It can be spawned with the PC cheat 'buzzoff'; GamePressure also lists one on a government-building rooftop (ladder access needed).", sources: [CHEAT_PAGE, UV], verification: "curated", confidence: 0.8, attrs: { category: "helicopters", manufacturer: "Nagasaki", availability: "STORY_MODE", story_mode_available: true, cheat_pc: "buzzoff", how_to_get: "PC cheat, or a rooftop spawn (per GamePressure)" } }),
  veh("comet", "Comet", { aliases: ["Pfister Comet"], summary: "A Pfister sports car that can be spawned with the PC cheat 'comet'.", sources: [CHEAT_PAGE], verification: "curated", confidence: 0.8, attrs: { category: "cars", manufacturer: "Pfister", vehicle_class: "sports", availability: "STORY_MODE", story_mode_available: true, cheat_pc: "comet" } }),
  veh("pcj-600", "PCJ-600", { aliases: ["PCJ 600", "Shitzu PCJ"], summary: "A Shitzu motorcycle spawned with the PC cheat 'rocket'.", sources: [CHEAT_PAGE], verification: "curated", confidence: 0.8, attrs: { category: "motorcycles", manufacturer: "Shitzu", availability: "STORY_MODE", story_mode_available: true, cheat_pc: "rocket" } }),
  veh("sanchez", "Sanchez", { aliases: ["Maibatsu Sanchez"], summary: "A Maibatsu off-road motorcycle spawned with the PC cheat 'offroad'.", sources: [CHEAT_PAGE], verification: "curated", confidence: 0.8, attrs: { category: "motorcycles", manufacturer: "Maibatsu", availability: "STORY_MODE", story_mode_available: true, cheat_pc: "offroad" } }),
  veh("tank", "Tank (Rhino)", { aliases: ["Rhino", "tanque", "military tank"], summary: "GamePressure lists a tank, the P-996 Lazer jet and military helicopters at Fort Zancudo, reachable when you have a four-star wanted level.", attrs: { category: "military", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Fort Zancudo military base (four-star wanted level per GamePressure)" }, relations: [{ predicate: "found_at", to: "location:fort-zancudo" }] }),
  veh("p-996-lazer", "P-996 Lazer", { aliases: ["Lazer", "jato militar"], summary: "A military jet listed at Fort Zancudo by GamePressure (four-star wanted level).", attrs: { category: "military", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Fort Zancudo (per GamePressure)" }, relations: [{ predicate: "found_at", to: "location:fort-zancudo" }] }),
  veh("submarine", "Submarine", { aliases: ["submarino", "Story Mode submarine"], summary: "A submarine available at the Sonar Collections Dock, which costs $250,000 to buy (GamePressure). Exact spawn and specs are not validated.", attrs: { category: "boats", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Buy the Sonar Collections Dock ($250,000)" }, relations: [{ predicate: "requires", to: "property:sonar-collections-dock" }, { predicate: "found_at", to: "location:sonar-collections-dock" }] }),
  veh("adder", "Adder", { aliases: ["Truffade Adder"], summary: "GamePressure lists an Adder near a clothes store on a street it calls 'Addlers street'. The exact spot is not validated; the Adder is also a GTA Online vehicle.", verification: "unverified", confidence: 0.4, attrs: { category: "cars", availability: "BOTH", story_mode_available: true, how_to_get: "Street spawn (location unvalidated)" } }),
  veh("luxor", "Luxor", { aliases: ["Luxor jet"], summary: "GamePressure lists the Luxor and Shamal at Los Santos Airport for $3 million each, requiring hangar ownership. Price and requirement are single-source.", attrs: { category: "planes", availability: "STORY_MODE", story_mode_available: true, how_to_get: "$3 million at LSIA with a hangar (single source)" }, relations: [{ predicate: "found_at", to: "location:los-santos-international-airport" }] }),
  veh("shamal", "Shamal", { aliases: ["Shamal jet"], summary: "Listed with the Luxor at Los Santos Airport for $3 million, requiring hangar ownership (GamePressure, single source).", attrs: { category: "planes", availability: "STORY_MODE", story_mode_available: true, how_to_get: "$3 million at LSIA with a hangar (single source)" }, relations: [{ predicate: "found_at", to: "location:los-santos-international-airport" }] }),
  veh("blazer-atv", "Blazer ATV", { aliases: ["Nagasaki Blazer"], summary: "GamePressure says a Nagasaki Blazer ATV appears at Trevor's trailer after the game is completed (via a message from Ron).", attrs: { category: "motorcycles", manufacturer: "Nagasaki", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Trevor's trailer after completion (single source)" } }),
  veh("tractor", "Tractor", { aliases: ["trator"], summary: "GamePressure lists a tractor next to the house near the lighthouse.", verification: "unverified", confidence: 0.4, attrs: { category: "utility", availability: "STORY_MODE", story_mode_available: true, how_to_get: "Near the lighthouse house (single source)" } }),
  veh("oppressor-mk2", "Oppressor Mk II", { aliases: ["Oppressor", "moto voadora", "flying bike"], summary: "A rocket-powered flying motorcycle that exists only in GTA Online. Isso pertence ao GTA Online, não ao Modo História.", story_mode: false, online_only: true, type: "online_boundary", id: "online_boundary:oppressor-mk2", sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.8)], verification: "curated", confidence: 0.85, attrs: { availability: "ONLINE_ONLY", kind: "vehicle" } }),
  veh("kosatka", "Kosatka submarine", { aliases: ["Kosatka"], summary: "A GTA Online submarine used for the Cayo Perico heist; it is not the submarine of Story Mode. Isso pertence ao GTA Online, não ao Modo História.", story_mode: false, online_only: true, type: "online_boundary", id: "online_boundary:kosatka", sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.8)], verification: "curated", confidence: 0.85, attrs: { availability: "ONLINE_ONLY", kind: "vehicle" } }),
];
// Vehicles that missions put you in (facts from the mission pages). STORY_MODE = confirmed in Story Mode; whether it also exists in GTA Online was not evaluated.
const MV = (id: string, name: string, how: string, mission: string, page: string, extra: Partial<Ent> = {}): Ent => veh(id, name, { summary: `${name}: ${how}`, sources: [gtw(page, 0.7)], attrs: { category: "mission vehicle", availability: "STORY_MODE", story_mode_available: true, how_to_get: how, mission }, relations: [{ predicate: "related_to", to: `mission:${mission}` }], confidence: 0.65, ...extra });
vehicles.push(
  MV("cargobob", "Cargobob", "stolen from Fort Zancudo in the Cargobob mission (Offshore approach of the Merryweather Heist); it also appears in Monkey Business.", "cargobob", "Cargobob_(mission)", { relations: [{ predicate: "found_at", to: "location:fort-zancudo" }, { predicate: "related_to", to: "mission:cargobob" }] }),
  MV("minisub", "Minisub", "taken from a docked ship at the Port of Los Santos in the Minisub mission (Freighter approach of the Merryweather Heist).", "minisub", "Minisub", { relations: [{ predicate: "found_at", to: "location:port-of-los-santos" }, { predicate: "related_to", to: "mission:minisub" }] }),
  MV("gauntlet", "Gauntlet", "three Gauntlets are acquired and modified at Los Santos Customs in the Gauntlet setup of the Big Score (Subtle approach); a gold-medal goal asks for $17,000 of modifications.", "gauntlet", "Gauntlet_(mission)"),
  MV("jb-700", "JB 700", "the car Franklin steals in Deep Inside and that is moved in Pack Man.", "deep-inside", "Deep_Inside"),
  MV("trashmaster", "Trashmaster", "stolen from Mirror Park in the Trash Truck setup for Blitz Play; it can also be spawned with a cheat (named on GamePressure; input not recorded).", "trash-truck", "Trash_Truck"),
  MV("tow-truck", "Tow Truck", "stolen from La Puerta in the Tow Truck setup for Blitz Play and delivered to the FIB impound lot.", "tow-truck", "Tow_Truck_(mission)"),
  MV("fire-truck", "Fire Truck", "stolen for the Fire Crew approach of the Bureau Raid in the Fire Truck setup (gold goal: call 911 first).", "fire-truck", "Fire_Truck_(mission)"),
  MV("duster", "Duster (crop duster)", "flown by Trevor in Minor Turbulence to hijack a cargo plane; also spawnable with a cheat.", "minor-turbulence", "Minor_Turbulence"),
  MV("phantom", "Phantom", "the truck used in Fame or Shame; a gold-medal goal asks for top speed in it and not unhooking the trailer.", "fame-or-shame", "Fame_or_Shame_(mission)"),
  MV("bugstars-van", "Bugstars van", "taken from the Bugstars warehouse at the Port of Los Santos in Bugstars Equipment (Smart approach of the Jewel Store Job).", "bugstars-equipment", "Bugstars_Equipment"),
);

// Cheat-spawned vehicles named on GamePressure's PlayStation cheat page (PC codes for these are not documented).
for (const [id, name, cat] of [["caddy", "Caddy", "cars"], ["crop-duster", "Crop Duster", "planes"], ["limo", "Limo", "cars"], ["rapid-gt", "Rapid GT", "cars"], ["stunt-plane", "Stunt Plane", "planes"]] as const) {
  vehicles.push(veh(id, name, { summary: `${name} can be spawned with a cheat (named on GamePressure's PlayStation cheat page). The input is not recorded in this knowledge base.`, attrs: { category: cat, availability: "STORY_MODE", story_mode_available: true, how_to_get: "Cheat spawn (input not validated)" }, confidence: 0.5 }));
}

/* ───────────────────────────── weapons ───────────────────────────── */
const WEAPONS: Record<string, string[]> = {
  melee: ["Antique Cavalry Dagger", "Baseball Bat", "Bottle", "Crowbar", "Golf Club", "Hammer", "Knife", "Nightstick"],
  pistols: ["AP Pistol", "Combat Pistol", "Heavy Pistol", "Pistol", "Pistol .50", "SNS Pistol", "Stun Gun", "Vintage Pistol"],
  smgs: ["Assault SMG", "Micro SMG", "SMG"],
  light_machine_guns: ["Combat MG", "Gusenberg Sweeper", "MG"],
  assault_rifles: ["Advanced Rifle", "Assault Rifle", "Bullpup Rifle", "Carbine Rifle", "Special Carbine"],
  snipers: ["Heavy Sniper", "Marksman Rifle", "Sniper Rifle"],
  shotguns: ["Assault Shotgun", "Bullpup Shotgun", "Heavy Shotgun", "Musket", "Pump Shotgun", "Sawed-Off Shotgun"],
  heavy: ["Firework Launcher", "Grenade Launcher", "Minigun", "RPG"],
  throwables: ["Grenade", "Jerry Can", "Molotov", "Sticky Bomb", "Tear Gas"],
};
const slug = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const WNOTE: Record<string, string> = {
  "Assault SMG": "Grand Theft Wiki and GamePressure both say it is tied to Rockstar Social Club membership (free at Ammu-Nation per GamePressure).",
  "Advanced Rifle": "GamePressure says it is available late in the game and obtainable at the Altruist Cult village.",
  "Stun Gun": "GamePressure notes a low fire rate (roughly one shot every four seconds).",
  "Heavy Sniper": "GamePressure notes it pierces armor.",
  "Sticky Bomb": "Used by several Gold Medal objectives (e.g. Military Hardware).",
};
const weapons: Ent[] = [];
for (const [cat, names] of Object.entries(WEAPONS)) {
  for (const n of names) {
    weapons.push({
      id: `weapon:${slug(n)}`, type: "weapon", name: n, aliases: [], verification: WNOTE[n] ? "curated" : "curated", confidence: 0.7,
      summary: `${n} is listed among the GTA V single-player ${cat.replace(/_/g, " ")} by Grand Theft Wiki. ${WNOTE[n] ?? ""} Damage, price and exact locations are not validated yet.`.replace(/\s+/g, " ").trim(),
      sources: [gtw("Weapons_in_GTA_V", 0.7), ...(WNOTE[n] ? [gp("best-weapons/z3567a", 0.55)] : [])],
      attrs: { category: cat, availability: "STORY_MODE" },
    });
  }
}

/** GTA5Wiki class pages list damage/magazine, but the site also lists GTA Online weapons and its overview and class pages disagree
 * (e.g. Assault Rifle 30 vs 32, RPG ~300 vs 100, Sniper Rifle 101 vs "High"). Numbers are therefore stored UNVERIFIED and only for weapons that Grand Theft Wiki also lists for single player. */
const WSTATS: Record<string, string> = {
  "Pistol": "damage 26, magazine 12", "AP Pistol": "damage 20, magazine 18", "Combat Pistol": "damage 32, magazine 12", "Pistol .50": "damage 60, magazine 9", "Vintage Pistol": "damage 38, magazine 7",
  "SNS Pistol": "magazine 6", "Heavy Pistol": "magazine 18",
  "Assault Rifle": "damage 30 or 32 (pages disagree), magazine 30", "Advanced Rifle": "damage 32, magazine 30", "Carbine Rifle": "damage 40, magazine 30", "Special Carbine": "damage 34, magazine 30", "Bullpup Rifle": "magazine 30",
  "Micro SMG": "damage 20, magazine 16/30", "Assault SMG": "damage 32, magazine 30/60", "SMG": "magazine 30",
  "Assault Shotgun": "damage 70, magazine 8/32", "Pump Shotgun": "damage 70, magazine 8", "Bullpup Shotgun": "magazine 14", "Heavy Shotgun": "magazine 12", "Sawed-Off Shotgun": "magazine 2", "Musket": "magazine 1",
  "Sniper Rifle": "damage 101 (overview) vs 'High' (class page), magazine 10", "Heavy Sniper": "magazine 6", "Marksman Rifle": "damage 65, magazine 8",
  "RPG": "damage ~300 (overview) vs 100 (class page), magazine 1", "Minigun": "magazine 500", "Grenade Launcher": "magazine 1",
};
for (const w of weapons) {
  const s = WSTATS[w.name];
  if (s) {
    w.sections = [...(w.sections ?? []), { kind: "stats", title: "Statistics (unverified)", status: "unverified", src: w.sources.length, text: `GTA5Wiki lists: ${s}. Caution: this site also lists GTA Online weapons and its own pages disagree in places, so treat the numbers as unconfirmed. Accuracy, range, fire rate, reload and price are not recorded.` }];
    w.sources = [...w.sources, g5w("weapons/", 0.4)];
  }
}

weapons.push({
  id: "weapon:railgun", type: "weapon", name: "Railgun", aliases: ["Rail gun"], verification: "unverified", confidence: 0.4,
  summary: "The sources diverge on the Railgun: GamePressure says it is unlocked after the mission Minor Turbulence and bought at a gun store in single player, but Grand Theft Wiki's single-player weapon list does not include it. It is also a GTA Online weapon.",
  sources: [gp("best-weapons/z3567a", 0.5), gtw("Weapons_in_GTA_V", 0.7)],
  attrs: { category: "heavy", availability: "UNKNOWN", conflict: "GamePressure: Story Mode after Minor Turbulence; Grand Theft Wiki single-player list: absent" },
  sections: [{ kind: "versions", title: "Divergence", status: "unverified", text: "As fontes divergem / The sources disagree on whether the Railgun is a Story Mode weapon: GamePressure says it is unlocked after Minor Turbulence; Grand Theft Wiki's single-player list omits it; GTA5Wiki lists it (damage 100, magazine 1) but that site also lists Online weapons. It may depend on the game version, which is not confirmed. It is certainly a GTA Online weapon. Confidence that it is in Story Mode: about 50%." }],
});

/* ───────────────────────────── Online boundary ───────────────────────────── */
const ONLINE: [string, string, string[], string][] = [
  ["gta-online-general", "GTA Online", ["GTA Online", "modo online", "Online mode", "negócios do GTA Online", "GTA Online business", "GTA Online businesses", "melhor negócio do GTA Online"], "GTA Online is the separate multiplayer mode, with its own economy, businesses, vehicles and updates."],
  ["cayo-perico-heist", "Cayo Perico Heist", ["Cayo Perico", "El Rubio"], "A GTA Online heist on the island of Cayo Perico."],
  ["diamond-casino-heist", "Diamond Casino Heist", ["Diamond Casino", "Casino Heist", "assalto ao cassino"], "A GTA Online heist set in the Diamond Casino."],
  ["doomsday-heist", "The Doomsday Heist", ["Doomsday", "Doomsday Heist"], "A GTA Online heist series."],
  ["nightclub-business", "Nightclub (business)", ["Nightclub", "boate", "clube noturno"], "A GTA Online business property."],
  ["arena-war", "Arena War", ["Arena Workshop"], "A GTA Online update."],
  ["shark-cards", "Shark Cards and the Online economy", ["Shark Card", "GTA$ Online", "GTA Online economy", "economia do Online"], "Real-money currency packs and the economy of GTA Online."],
  ["agency-business", "Agency (business)", ["Franklin's agency", "Security Contracts"], "A GTA Online property with contracts."],
  ["bunker-business", "Bunker (business)", ["Bunker", "bunker business"], "A GTA Online business property."],
];
const online: Ent[] = ONLINE.map(([s, name, aliases, summary]) => ({
  id: `online_boundary:${s}`, type: "online_boundary", name, aliases, summary: `${summary} Isso pertence ao GTA Online, não ao Modo História.`,
  story_mode: false, online_only: true, verification: "curated", confidence: 0.85,
  sources: [rs("https://www.rockstargames.com/gta-v", "rockstar", 0.8)], attrs: { scope: "GTA Online only" },
}));

write("entities-heists.json", heists);
write("entities-collectibles.json", collectibles);
write("entities-vehicles-weapons.json", [...vehicles.filter((v) => v.type === "vehicle"), ...weapons]);
write("entities-online-boundary.json", [...vehicles.filter((v) => v.type === "online_boundary"), ...online]);
void IGN_MAP;
