import { normalize } from "@/lib/text";
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
  | "practical_plan"; // the curated, sourced order of play for 100%

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
  /** For list_type: which typed table to list and an optional filter. */
  listing?: { type: "random_event" | "property" | "weapon" | "vehicle" | "easter_egg" | "stranger_mission"; filter?: "income" | "free" | "location" };
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
const ROMANCE = /\b(namorad\w*|girlfriends?|boyfriends?|dating|go on a date|encontros? amoros\w*|romance|romantic\w*|booty ?calls?|hook ?ups?|ficar com|sex\w*|transar|relacionamentos? amoros\w*|relationships?)\b/;
const COMPLETION = /\b(100|cem por cento|100 ?%|completion|completar o jogo|checklist|contam para|counts? (for|towards?)|requisitos? (de|para) 100)\b/;
const AFTER = /\b(depois d[ae]|apos|after (finishing |completing )?|terminei|acabei de|finished|completed|o que (posso|eu posso|da pra) fazer|what (can|should) i do (now|next)|what opens|what unlocks after)\b/;
const UNLOCKED_BY = /\b(qual missao (desbloqueia|libera)|que missao (desbloqueia|libera)|what (mission )?unlocks|which mission unlocks|how (do i|to) unlock|como (desbloqueio|libero|desbloquear|liberar))\b/;
const WHERE = /\b(onde|where|localiza\w*|encontr\w*|find|achar|acho|meet|conhecer)\b/;
const COLLECTIBLES = /\b(colecionave\w*|coletave\w*|collectibles?|itens? colecionave\w*)\b/;
const COUNT = /\b(quantas?|quantos?|how many|numero de|number of)\b/;
const LIST = /\b(todas?|todos|all|every|list\w*|quais|which|existem|exist)\b/;
const NUMBER = /(?:#|\bn(?:o|umero)?\.?\s*|\b)(\d{1,2})\b/;
const LIMIT = /\b(\d{1,2})\s+(?:pecas?|parts?|itens?|items?|cartas?|scraps?|plantas?|peyotes?|barris?|barrels?|mais proxim\w*|closest|nearest)/;

function protagonistOf(analysis: QueryAnalysis, n: string): Protagonist | undefined {
  for (const [p, id] of Object.entries(PROTAGONIST_IDS) as Array<[Protagonist, string]>) {
    if ([...analysis.entities, ...analysis.inheritedEntities].some((e) => e.id === id)) return p;
  }
  const m = n.match(/\b(michael|franklin|trevor)\b/);
  return m ? ((m[1] as string)[0]?.toUpperCase() + (m[1] as string).slice(1)) as Protagonist : undefined;
}

export function planQuery(analysis: QueryAnalysis): Plan {
  const n = normalize(analysis.original);
  const ents = [...analysis.entities, ...analysis.inheritedEntities];
  const protagonist = protagonistOf(analysis, n);
  const category = ents.find((e) => e.type === "collectible");
  const item = ents.find((e) => e.type === "collectible_item");
  const area = ents.find((e) => e.type === "location");
  const mission = ents.find((e) => e.type === "mission" || e.type === "heist");
  const character = ents.find((e) => e.type === "character" && !Object.values(PROTAGONIST_IDS).includes(e.id));
  const limitMatch = n.match(LIMIT);
  const plan: Plan = { goal: null, protagonist, category, area, item, mission, character, limit: limitMatch ? Math.min(20, Number(limitMatch[1])) : 5, steps: [] };
  const step = (s: string) => plan.steps.push(s);
  if (protagonist) step(`protagonist = ${protagonist}`);
  if (category) step(`category = ${category.name}`);
  if (area) step(`area = ${area.name}`);
  if (mission) step(`mission = ${mission.name}`);

  // "Does Tracey have a boyfriend?" is about Tracey, not a request for the protagonists' hook-up options.
  if (ROMANCE.test(n) && (protagonist || (!character && /\b(namorad|girlfriend|booty)/.test(n)))) {
    plan.goal = "romance";
    step("goal = relationships / hook-ups (graph: hookup_with edges + evidence)");
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
  if (category) {
    const num = n.match(NUMBER);
    if (NEAR.test(n) && (area || protagonist)) {
      plan.goal = "nearest";
      step(`goal = nearest ${plan.limit} ${category.name} to ${area ? area.name : `${protagonist}'s safehouse`} (geo: distance on in-game coordinates)`);
      return plan;
    }
    if (area && IN_AREA.test(n)) {
      plan.goal = "in_area";
      step(`goal = ${category.name} in ${area.name} (SQL: items by area)`);
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
  if ((COMPLETION.test(n) || analysis.intents.includes("100_percent_completion")) && !PRACTICAL.test(n)) {
    plan.goal = "completion";
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
    step(`goal = list ${listing.type}${listing.filter ? ` (${listing.filter})` : ""}${area ? ` in ${area.name}` : ""} (SQL over typed tables)`);
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
  if (/\b(veiculos?|vehicles?|carros?|cars?)\b/.test(n) && !ents.some((e) => e.type === "vehicle")) {
    if (/\b(raros?|rare|especia\w*|special|unico\w*|unique|spawn\w*|perto|near|nearby|encontr\w*|find|onde|where)\b/.test(n)) return { type: "vehicle", filter: "location" };
    if (asks) return { type: "vehicle" };
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
