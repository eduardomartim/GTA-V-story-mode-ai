import { contentTokens, normalize } from "@/lib/text";
import { canonicalizeQuery } from "./glossary";
import { classifyIntents } from "./intents";
import type { EntityRef, QueryAnalysis } from "./types";

/**
 * Query planner: decomposes a question into a goal + structured constraints so that questions answerable by data
 * are answered by SQL / graph / geo executors instead of hoping that similarity search finds the right chunks.
 *
 *   "Onde encontro um peyote perto do Trevor?" → goal nearest · category Peyote Plants · anchor = Trevor's home
 *   "Como conseguir uma namorada pro Trevor?"  → goal romance · protagonist Trevor
 *   "Quais atividades do Trevor contam para 100%?" → goal completion · protagonist Trevor
 *   "Estou depois da missão X, o que faço agora?" → goal after_mission · mission X
 *
 * Deterministic and cheap (regex + the entities already resolved by the alias index); no LLM call.
 */
export type Protagonist = "Michael" | "Franklin" | "Trevor";

export type Goal =
  | "nearest" // closest items of a category to an anchor (area or protagonist home)
  | "in_area" // items/content inside a named area
  | "list_items" // every item of a collectible category
  | "item_lookup" // one specific numbered item ("letter scrap 12")
  | "romance" // hook-ups / girlfriends for a protagonist
  | "completion" // what counts for 100% (optionally per protagonist)
  | "after_mission" // what opens up after mission X
  | "unlocked_by" // which mission unlocks X
  | "character_location" // where to find a character
  | "nearby_collectibles" // every collectible type near an anchor (+ which categories count for 100%)
  | "list_type" // list entities of one kind with an optional filter (income, free, location…)
  | "practical_plan" // the curated, sourced order of play for 100%
  | "completion_fact" // one fact about one thing and 100%: how many exist, whether / how many count
  | "entity_profile"; // what the KB says about one named entity (used for parts of compound questions)

export interface Plan {
  goal: Goal | null;
  protagonist?: Protagonist;
  category?: EntityRef; // collectible category
  area?: EntityRef; // location / area anchor
  item?: EntityRef;
  mission?: EntityRef;
  character?: EntityRef;
  /** Set by a previous goal for a follow-up goal (e.g. romance → where to find that person). */
  focusCharacter?: string;
  /** For list_type: which typed table to list and its constraints. */
  listing?: { type: "random_event" | "property" | "weapon" | "vehicle" | "easter_egg" | "stranger_mission"; filter?: "income" | "free" | "location"; vehicleClass?: string[] };
  /** Geographic scope: the named area plus same-named places ("Vinewood" → East/West/Downtown Vinewood, Vinewood Hills). */
  areas?: EntityRef[];
  /** For completion / completion_fact: what part of the 100% checklist the question is about. */
  completion?: { targets: EntityRef[]; categories: string[]; labels: string[]; ask: "count" | "counts" | "list" | "overview"; progress: boolean; about100?: boolean };
  /** For entity_profile: the entity and the aspect the clause asks about. */
  target?: EntityRef;
  aspect?: "where" | "who" | "what";
  /** Clause of a compound question this plan answers (for the answer heading). */
  clause?: string;
  limit: number;
  /** Human-readable decomposition (shown in debug output and used by tests). */
  steps: string[];
}

export const PROTAGONIST_IDS: Record<Protagonist, string> = {
  Michael: "character:michael-de-santa",
  Franklin: "character:franklin-clinton",
  Trevor: "character:trevor-philips",
};
/** Default anchor when a question says "near Trevor": the protagonist's safehouse in the knowledge base. */
export const PROTAGONIST_HOMES: Record<Protagonist, string[]> = {
  Michael: ["location:michaels-house"],
  Franklin: ["location:franklins-vinewood-hills-house", "location:franklins-strawberry-house"],
  Trevor: ["location:trevors-trailer"],
};

const NEAR = /\b(perto|proxim\w*|mais perto|nearby|near|nearest|closest|around|arredores|vizinhanca)\b/;
const IN_AREA = /\b(em|no|na|in|at|inside|dentro de|around)\b/;
// Not "encontro": in Portuguese it also means "I find" ("onde encontro peyote?").
// Stems, so the natural forms match ("namora", "namorar", "romântica", "paquerar"); "encontro" only as a date ("encontro com X").
const ROMANCE = /\b(namor\w*|girlfriends?|boyfriends?|dating|go on a date|encontros? amoros\w*|romance|romant\w*|paquer\w*|flert\w*|booty ?calls?|hook ?ups?|ficar com|pode ficar|com quem \w+ (\w+ )?(pode|consegue) ficar|sair com|sex\w*|transar|relacionamentos? amoros\w*|relationships?|strippers?|levar \w+ \w* ?(pra|para) casa|take \w+ home)\b|(?<!onde )\bencontros? com\b/;
const COUNTS = /\b(conta|contam|contar|counts?|count towards?|necessari\w*|exigid\w*|obrigatori\w*|required|requirement\w*|precis\w*|needed|need|vale|valem)\b/;
const REWARD_Q = /\b(o que (eu )?(ganho|ganha|recebo)|qual (e )?a recompensa|recompensa|what do (i|you) get|rewards?)\b/;
const PROGRESS = /\b(falta|faltam|faltando|missing|left|remaining|resta|restam)\b/;
/** Parts of the 100% checklist users ask about by name (categories of completion_requirements, or label words). */
const COMPLETION_SCOPES: Array<{ re: RegExp; categories: string[]; labels: string[] }> = [
  { re: /\b(colecionave\w*|coletave\w*|collectibles?)\b/, categories: [], labels: ["collect", "letter", "spaceship", "stunt", "bridge", "knife", "peyote", "nuclear", "submarine", "package", "epsilon", "monkey"] },
  { re: /\b(hobb\w*|passatempos?|pastimes?)\b/, categories: ["hobbies_and_pastimes"], labels: [] },
  { re: /\b(strangers?( and| e| &)? freaks|estranhos)\b/, categories: ["strangers_and_freaks"], labels: [] },
  { re: /\b(random events?)\b/, categories: ["random_events"], labels: [] },
  { re: /\b(missao|missoes|missions?|historia|story)\b/, categories: ["missions"], labels: [] },
  { re: /\b(propriedad\w*|propert\w*|imoveis|negocios|businesses)\b/, categories: [], labels: ["propert"] },
];
/** Vehicle classes as players name them (PT/EN) → the class names of the vehicle roster. */
export const VEHICLE_CLASSES: Array<[RegExp, string[]]> = [
  [/\b(classicos?|classics?)\b/, ["sports classics"]],
  [/\b(super ?esportivos?|supercars?|supercarros?|super)\b/, ["super"]],
  [/\b(esportivos?|sports?|sport cars?)\b/, ["sports"]],
  [/\b(muscle|musculos?)\b/, ["muscle"]],
  [/\b(suvs?)\b/, ["suvs"]],
  [/\b(sedans?)\b/, ["sedans"]],
  [/\b(coupes?|cupes?)\b/, ["coupes"]],
  [/\b(compactos?|compacts?)\b/, ["compacts"]],
  [/\b(motos?|motocicletas?|motorcycles?|motorbikes?)\b/, ["motorcycles"]],
  [/\b(bicicletas?|bikes?|bicycles?|cycles?)\b/, ["cycles"]],
  [/\b(helicopteros?|helicopters?)\b/, ["helicopters"]],
  [/\b(avioes|aviao|planes?|aircraft)\b/, ["planes"]],
  [/\b(barcos?|lanchas?|boats?)\b/, ["boats"]],
  [/\b(off ?road|fora de estrada|4x4)\b/, ["off-road"]],
  [/\b(militar\w*|military)\b/, ["military"]],
  [/\b(emergencia|emergency|policia\w*|police|viaturas?|ambulancias?)\b/, ["emergency"]],
  [/\b(vans?)\b/, ["vans"]],
  [/\b(comercia\w*|commercial|caminh(ao|oes|onetes?)|trucks?)\b/, ["commercial"]],
];
/**
 * Class names that by themselves name vehicles ("motos", "helicopteros"). Class adjectives ("super", "militar",
 * "policia", "esportivo") also describe cheats, missions and places, so on their own they never select a vehicle listing.
 */
const VEHICLE_CLASS_NOUN = /\b(supercars?|supercarros?|super ?esportivos?|motos?|motocicletas?|motorcycles?|motorbikes?|bicicletas?|bikes?|bicycles?|helicopteros?|helicopters?|avioes|aviao|planes?|aircraft|barcos?|lanchas?|boats?|suvs?|sedans?|coupes?|vans?|caminh(ao|oes|onetes?)|trucks?|ambulancias?|viaturas?)\b/;
const COMPLETION = /\b(100|cem por cento|100 ?%|completion|completar o jogo|checklist|contam para|counts? (for|towards?)|requisitos? (de|para) 100)\b/;
const AFTER = /\b(depois d[ae]|apos|after (finishing |completing )?|terminei|acabei de|finished|completed|o que (posso|eu posso|da pra) fazer|what (can|should) i do (now|next)|what opens|what unlocks after)\b/;
const UNLOCKED_BY = /\b(qual missao (desbloqueia|libera)|que missao (desbloqueia|libera)|what (mission )?unlocks|which mission unlocks|how (do i|to) unlock|como (desbloqueio|libero|desbloquear|liberar))\b/;
const WHERE = /\b(onde|where|localiza\w*|encontr\w*|find|achar|acho|meet|conhecer)\b/;
const COLLECTIBLES = /\b(colecionave\w*|coletave\w*|collectibles?|itens? colecionave\w*)\b/;
const COUNT = /\b(quantas?|quantos?|how many|numero de|number of)\b/;
const LIST = /\b(todas?|todos|all|every|list\w*|quais|which|existem|exist)\b/;
const NUMBER = /(?:#|\bn(?:o|umero)?\.?\s*|\b)(\d{1,2})\b/;
/** "number 12" / "#12" (an item), not "100%" or a count. */
const NUMBER_ITEM = /(#\s*\d{1,2}\b|\b(n(o|umero)?|number)\.?\s*\d{1,2}\b)/;
// "as 3 peças", "3 spaceship parts", "5 letter scraps": one modifier word may sit between the number and the noun.
const LIMIT = /\b(\d{1,2})\s+(?:\w+\s+)?(?:pecas?|parts?|pieces?|itens?|items?|cartas?|scraps?|plantas?|plants?|peyotes?|barris?|barrels?|waste|mais proxim\w*|closest|nearest)/;

function protagonistOf(analysis: QueryAnalysis, n: string): Protagonist | undefined {
  for (const [p, id] of Object.entries(PROTAGONIST_IDS) as Array<[Protagonist, string]>) {
    if ([...analysis.entities, ...analysis.inheritedEntities].some((e) => e.id === id)) return p;
  }
  const m = n.match(/\b(michael|franklin|trevor)\b/);
  return m ? ((m[1] as string)[0]?.toUpperCase() + (m[1] as string).slice(1)) as Protagonist : undefined;
}

export function planQuery(analysis: QueryAnalysis): Plan {
  // The canonical text: chat abbreviations and community words are already normalised ("q missão libera…").
  const n = analysis.canonical || normalize(analysis.original);
  const ents = [...analysis.entities, ...analysis.inheritedEntities];
  const protagonist = protagonistOf(analysis, n);
  const category = ents.find((e) => e.type === "collectible");
  const item = ents.find((e) => e.type === "collectible_item");
  const area = ents.find((e) => e.type === "location");
  // A heist and its mission share a name; unlock / requirement edges are recorded on the mission.
  const mission = ents.find((e) => e.type === "mission") ?? ents.find((e) => e.type === "heist");
  const character = ents.find((e) => e.type === "character" && !Object.values(PROTAGONIST_IDS).includes(e.id));
  const limitMatch = n.match(LIMIT);
  const plan: Plan = { goal: null, protagonist, category, area, item, mission, character, limit: limitMatch ? Math.min(20, Number(limitMatch[1])) : 5, steps: [] };
  const step = (s: string) => plan.steps.push(s);
  if (protagonist) step(`protagonist = ${protagonist}`);
  if (category) step(`category = ${category.name}`);
  if (area) step(`area = ${area.name}`);
  if (!area && analysis.places?.length) {
    plan.areas = analysis.places;
    step(`area = ${analysis.places.map((p) => p.name).join(" / ")} (places sharing a name)`);
  }
  const hasArea = Boolean(area || plan.areas?.length);
  if (mission) step(`mission = ${mission.name}`);

  // "A Tracey é namorada do Trevor?" / "Como funciona o encontro com a Ursula?" are about THAT character: the romance
  // executor answers for her (relationship evidence, family ties) instead of listing every protagonist hook-up.
  if (ROMANCE.test(n) && (protagonist || character || /\b(namor|girlfriend|booty|romant|paquer|stripper)/.test(n))) {
    plan.goal = "romance";
    step(`goal = relationships / hook-ups${character ? ` of ${character.name}` : ""} (graph: hookup_with edges + evidence)`);
    return plan;
  }
  const isCompletion = COMPLETION.test(n) || analysis.intents.includes("100_percent_completion");
  // One fact about one thing: "Quantos Stunt Jumps existem?", "Peyote conta para 100%?", "Quantos random events contam?".
  const PRIORITY = ["collectible", "random_event", "hobby", "activity", "property", "mission", "heist", "vehicle", "weapon"];
  const byName = new Map<string, EntityRef>();
  for (const e of ents.filter((x) => PRIORITY.includes(x.type))) {
    const key = normalize(e.name).replace(/ (plants?|parts?|pieces?)$/, "");
    const prev = byName.get(key);
    if (!prev || PRIORITY.indexOf(e.type) < PRIORITY.indexOf(prev.type)) byName.set(key, e);
  }
  // A shared alias ("peyote": the plants AND the car) resolves to the kind the question is about.
  const collected = [...byName.values()];
  const targets = collected.some((e) => e.type === "collectible") ? collected.filter((e) => !["vehicle", "weapon"].includes(e.type) || !ents.some((x) => x.type === "collectible" && normalize(x.name).includes(normalize(e.name)))) : collected;
  const askCount = COUNT.test(n);
  const wholeCategory = targets.length > 0 && targets.every((t) => /overview|\(list\)/i.test(t.name) || /^(strangers and freaks|random events|hobbies and pastimes)$/i.test(t.name));
  if (targets.length && !(wholeCategory && LIST.test(n) && !askCount) && !hasArea && !NEAR.test(n) && !NUMBER_ITEM.test(n) && (isCompletion ? (askCount || COUNTS.test(n)) : askCount && targets.some((t) => t.type === "collectible"))) {
    // About the 100% checklist → the completion goal, answering this one fact; a plain count → completion_fact.
    plan.goal = isCompletion ? "completion" : "completion_fact";
    // "Quantos existem?" is answered with the count only; the 100% rule is added when the question is about 100%.
    plan.completion = { targets: targets.slice(0, 2), categories: [], labels: [], ask: askCount ? "count" : "counts", progress: false, about100: isCompletion };
    step(`goal = ${askCount ? "how many" : "does it count for 100%"}: ${targets.slice(0, 2).map((t) => t.name).join(", ")} (SQL: collectibles + completion_requirements)`);
    return plan;
  }
  if (item && !category) {
    plan.goal = "item_lookup";
    step(`goal = specific item ${item.name}`);
    return plan;
  }
  if (!category && !item && COLLECTIBLES.test(n) && (area || protagonist) && (NEAR.test(n) || IN_AREA.test(n))) {
    plan.goal = "nearby_collectibles";
    plan.limit = limitMatch ? plan.limit : 12;
    step(`goal = collectibles of every type near ${area ? area.name : `${protagonist}'s safehouse`} + 100% relevance per category (geo + SQL)`);
    return plan;
  }
  // "O que ganho coletando todas as peças de nave?" asks for the reward, not the 50 items.
  if (category && REWARD_Q.test(n)) {
    plan.goal = "entity_profile";
    plan.target = category;
    plan.aspect = "what";
    plan.clause = analysis.original.replace(/[?!.]+$/, "");
    step(`goal = reward of ${category.name} (entity record)`);
    return plan;
  }
  if (category) {
    const num = n.match(NUMBER);
    if (NEAR.test(n) && (area || protagonist)) {
      plan.goal = "nearest";
      step(`goal = nearest ${plan.limit} ${category.name} to ${area ? area.name : `${protagonist}'s safehouse`} (geo: distance on in-game coordinates)`);
      return plan;
    }
    if (hasArea && IN_AREA.test(n)) {
      plan.goal = "in_area";
      step(`goal = ${category.name} in ${area?.name ?? plan.areas?.map((p) => p.name).join(" / ")} (SQL: items by area / region)`);
      return plan;
    }
    if (num && !LIST.test(n) && Number(num[1]) >= 1 && Number(num[1]) <= 60) {
      plan.goal = "item_lookup";
      plan.limit = Number(num[1]);
      step(`goal = ${category.name} number ${num[1]}`);
      return plan;
    }
    // "How many are there?" is a count (answered from the category, with its version caveats), not a listing.
    if ((LIST.test(n) || WHERE.test(n)) && !COUNT.test(n)) {
      plan.goal = "list_items";
      step(`goal = list every ${category.name} item (SQL)`);
      return plan;
    }
  }
  // "In what order / what plan for 100%?" is answered by the curated practical plan, not by the raw checklist.
  const PRACTICAL = /\b(ordem|order|plano|plan|roteiro|passo a passo|step by step|sequencia|sequence)\b/;
  if (isCompletion && !PRACTICAL.test(n)) {
    plan.goal = "completion";
    // A part of the checklist ("Quais hobbies contam?", "Quais propriedades são necessárias?") gets only that part.
    const scope = COMPLETION_SCOPES.filter((sc) => sc.re.test(n) || sc.re.test(analysis.canonical ?? n));
    plan.completion = {
      targets: [], categories: scope.flatMap((sc) => sc.categories), labels: scope.flatMap((sc) => sc.labels),
      ask: scope.length ? "list" : "overview", progress: PROGRESS.test(n),
    };
    step(`goal = 100% checklist${protagonist ? ` filtered to ${protagonist}` : ""} (SQL: completion_requirements + graph available_to)`);
    return plan;
  }
  if (mission && AFTER.test(n)) {
    plan.goal = "after_mission";
    step(`goal = what opens after ${mission.name} (graph: unlocks / requires)`);
    return plan;
  }
  if (UNLOCKED_BY.test(n) && (mission || ents.length)) {
    plan.goal = "unlocked_by";
    step("goal = what unlocks the target (graph: inbound unlocks / outbound requires)");
    return plan;
  }
  if (character && WHERE.test(n)) {
    plan.goal = "character_location";
    step(`goal = where to find ${character.name} (graph: lives_at / appears_in + geo)`);
    return plan;
  }
  const listing = listTypeOf(n, analysis);
  if (listing) {
    plan.goal = "list_type";
    plan.listing = listing;
    step(`goal = list ${listing.type}${listing.filter ? ` (${listing.filter})` : ""}${listing.vehicleClass ? ` class ${listing.vehicleClass.join("/")}` : ""}${protagonist ? ` for ${protagonist}` : ""}${area ? ` in ${area.name}` : ""} (SQL over typed tables)`);
    return plan;
  }
  return plan;
}

/** "Quais propriedades geram renda?", "Which weapons are free?", "Quais random events existem?", "Quais easter eggs há no X?" */
function listTypeOf(n: string, analysis: QueryAnalysis): Plan["listing"] {
  if (COUNT.test(n)) return undefined; // counts come from the category / overview entity
  const asks = /\b(quais|which|what are|list\w*|todas?|todos|all|existem|exist|are there|mostre|show)\b/.test(n);
  const ents = [...analysis.entities, ...analysis.inheritedEntities];
  // A question that already names one entity of that kind is about that entity, not a request for the full list.
  const names = (t: string) => ents.some((e) => e.type === t && !/^random events$/i.test(e.name));
  if (/\b(random events|eventos aleatorios)\b/.test(n) && asks && !names("random_event")) return { type: "random_event" };
  if (/\b(propriedades?|properties|property|negocios?|businesses)\b/.test(n) && asks) {
    return { type: "property", filter: /\b(renda|income|lucr\w*|geram|gera|rendem|rende|weekly|semanal|generate\w*|earn\w*)\b/.test(n) ? "income" : undefined };
  }
  if (/\b(armas?|weapons?)\b/.test(n) && asks && !ents.some((e) => e.type === "weapon")) {
    return { type: "weapon", filter: /\b(sem comprar|gratis|de graca|free|without (buying|paying)|nao (precisa|preciso) comprar|nao compra\w*)\b/.test(n) ? "free" : undefined };
  }
  const classes = VEHICLE_CLASSES.filter(([re]) => re.test(n)).flatMap(([, c]) => c);
  // "carros esportivos" is the Sports class, not "sports classics" unless the question says classic.
  const vehicleClass = classes.includes("sports classics") ? classes.filter((c) => c !== "sports") : classes;
  const vehicleNoun = /\b(veiculos?|vehicles?|carros?|cars?)\b/.test(n) || (vehicleClass.length > 0 && asks && VEHICLE_CLASS_NOUN.test(n));
  if (vehicleNoun && !ents.some((e) => e.type === "vehicle")) {
    if (/\b(raros?|rare|especia\w*|special|unico\w*|unique|spawn\w*|perto|near|nearby|encontr\w*|find|onde|where)\b/.test(n)) return { type: "vehicle", filter: "location", vehicleClass: vehicleClass.length ? vehicleClass : undefined };
    if (asks) return { type: "vehicle", vehicleClass: vehicleClass.length ? vehicleClass : undefined };
  }
  if (/\b(easter eggs?|segredos?|secrets?)\b/.test(n) && asks) return { type: "easter_egg" };
  if (/\bstrangers?( and| e| &)? freaks\b/.test(n) && asks) return { type: "stranger_mission" };
  return undefined;
}

/**
 * Composite questions need more than one executor ("100% as Trevor after mission X" = completion + after_mission).
 * The primary goal answers; secondary goals add their evidence to the same context.
 */
export function secondaryGoals(plan: Plan, analysis: QueryAnalysis): Goal[] {
  const n = normalize(analysis.original);
  const out: Goal[] = [];
  if (plan.goal === "completion" && plan.mission && AFTER.test(n)) out.push("after_mission");
  if (plan.goal === "after_mission" && (COMPLETION.test(n) || analysis.intents.includes("100_percent_completion"))) out.push("completion");
  if (plan.goal === "romance" && /\b(onde|where|encontr\w*|find|meet)\b/.test(n)) out.push("character_location");
  if ((plan.goal === "completion" || plan.goal === "after_mission") && /\b(prioriz\w*|priorit\w*|ordem|order|primeiro|first|plano|plan)\b/.test(n)) out.push("practical_plan");
  return out;
}

/**
 * Compound questions ("Quanto custa o Hookies, quem pode comprar e quanto ele rende?"): the question is split at its
 * interrogative boundaries and each clause is planned on its own, sharing the entities the whole question resolved.
 * A clause that only asks about a named entity ("quem é a Ursula", "onde encontrar a Space Docker") becomes an
 * entity_profile plan. Returns [] for single-part questions.
 */
const CLAUSE_START = "(?:o que|onde|quem|qual|quais|quanto|quantos|quantas|quando|como|se|em que|que horas?|precis\\w*|cont\\w*|where|who|which|how|what|when|whether|if|does|do|is|are|can)\\b";
const CLAUSE_SPLIT = new RegExp(`\\s*(?:[?;]|,|\\s(?:e|and|alem disso|tambem|also)\\s)\\s*(?=(?:e |and )?${CLAUSE_START})`, "i");
const ASKS = new RegExp(`(^|\\s)${CLAUSE_START}|\\b(me diga|diga|mostre|me mostre|liste|explique|quero saber|tell me|show me|list|explain)\\b`);
/** Entity kinds a clause intent is about (for choosing a compound clause's subject). */
const CLAUSE_TYPES: Partial<Record<string, string[]>> = { easter_egg: ["easter_egg"], random_event: ["random_event"], vehicle_information: ["vehicle"], weapon_information: ["weapon"], property: ["property"] };
const REFERS_BACK = /\b(isso|isto|ele|ela|eles|elas|dele|dela|deles|delas|nele|nela|it|its|they|them|their|this|that|quantos|quantas|how many)\b/;
const ASPECT_WHERE = /\b(onde|where|encontr\w*|find|fica|located|aparece\w*|appears?)\b/;
const ASPECT_WHO = /\b(quem|who)\b/;

export function planClauses(analysis: QueryAnalysis): Plan[] {
  // Split on the user's own punctuation ("Quanto custa o Hookies, quem pode comprar e quanto rende?"), then normalise.
  // Each part keeps the user's wording (for the answer heading) next to its normalised form (for planning).
  const raw = analysis.original.split(CLAUSE_SPLIT).map((p) => p.trim().replace(/^(e|and)\s+/i, "").replace(/[?!.;,]+$/, "")).filter((p) => contentTokens(p).length >= 1);
  // Only a part that itself asks or requests something is a clause; context ("In the Big Score, does Subtle or
  // Obvious pay more?", "Terminei a missão X. O que faço?") is joined to the part that follows it.
  const parts: string[] = [];
  let carry = "";
  for (const p of raw) {
    const text = carry ? `${carry} ${p}` : p;
    if (ASKS.test(normalize(p))) { parts.push(text); carry = ""; } else carry = text;
  }
  if (carry) {
    if (parts.length) parts[parts.length - 1] = `${parts[parts.length - 1]} ${carry}`;
    else parts.push(carry);
  }
  if (parts.length < 2) return [];
  // Question-level constraints ("… e quais posso pegar como Trevor") apply to every clause.
  const whole = planQuery(analysis);
  const out: Plan[] = [];
  let lastSubject: EntityRef | undefined;
  for (const shown of parts) {
    const part = normalize(shown);
    // The clause's own entities; a clause with only a pronoun ("quem pode usar", "se isso conta") keeps the question's.
    const own = new Set(analysis.matches.filter((m) => part.includes(m.alias)).flatMap((m) => m.refs.map((r) => r.id)));
    const ownSubject = analysis.entities.some((e) => own.has(e.id) && e.type !== "completion" && !Object.values(PROTAGONIST_IDS).includes(e.id));
    // A clause refers back to the question's subject with a pronoun or an elliptical count ("se isso conta",
    // "quantos contam"); a clause with neither ("o que conta para 100%?") is a general question of its own.
    // "… e contam para 100%?" (a verb with no subject of its own) is elliptical: it shares the subject too.
    const refersBack = REFERS_BACK.test(part) || /^(precis\w*|cont\w*|does|do|is|are|can|e (precis|cont)\w*)\b/.test(part);
    // A back-reference takes the subject, not the place constraint of the other clause ("… near Sandy Shores and do they count?").
    const subEntities = ownSubject ? analysis.entities.filter((e) => own.has(e.id)) : refersBack ? analysis.entities.filter((e) => e.type !== "location" || own.has(e.id)) : analysis.entities.filter((e) => own.has(e.id));
    // The clause's own intents: "onde encontrar a Space Docker" is a location question even when another clause
    // of the same question is about 100%.
    const canonical = canonicalizeQuery(part);
    const sub: QueryAnalysis = { ...analysis, original: shown, canonical, entities: subEntities, intents: classifyIntents(canonical === part ? part : `${part} ${canonical}`, subEntities) };
    const p = planQuery(sub);
    p.clause = shown;
    if (!p.protagonist && whole.protagonist) p.protagonist = whole.protagonist;
    if (!p.goal) {
      // A clause that only names a protagonist is a constraint on the others, not a subject of its own; a clause
      // without any entity ("quem pode comprar?") asks about the question's subject.
      const pool = sub.entities.length ? sub.entities : analysis.entities;
      // The kind of thing the clause asks about first ("onde fica o fantasma do Mount Gordo" → the ghost, not the mountain).
      const wanted = new Set<string>(sub.intents.flatMap((i) => CLAUSE_TYPES[i] ?? []));
      const eligible = [...pool, ...analysis.entities].filter((e) => !Object.values(PROTAGONIST_IDS).includes(e.id) && e.type !== "completion");
      // A clause with no subject of its own ("em que horário aparece?") continues the previous clause's subject.
      const target = eligible.find((e) => wanted.has(e.type)) ?? (!ownSubject ? lastSubject : undefined) ?? pool.find((e) => !Object.values(PROTAGONIST_IDS).includes(e.id) && e.type !== "completion");
      if (!target) continue;
      p.goal = "entity_profile";
      p.target = target;
      p.aspect = ASPECT_WHERE.test(part) ? "where" : ASPECT_WHO.test(part) ? "who" : "what";
      p.steps.push(`goal = what the KB says about ${target.name} (${p.aspect})`);
    }
    // Two attribute clauses about the same entity ("quanto custa" / "quanto rende") are different questions.
    lastSubject = p.target ?? p.completion?.targets[0] ?? p.character ?? lastSubject;
    const key = (x: Plan) => `${x.goal}|${x.target?.id ?? x.completion?.targets.map((t) => t.id).join() ?? ""}|${x.aspect ?? ""}|${x.goal === "entity_profile" ? x.clause : ""}`;
    if (!out.some((x) => key(x) === key(p))) out.push(p);
  }
  return out.length >= 2 ? out : [];
}
