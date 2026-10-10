import { contentTokens, normalize, tokenize } from "@/lib/text";
import { expandQuery } from "./glossary";
import { PROTAGONIST_IDS } from "./planner";
import { topicalTerms } from "./retrieval";
import type { Lang, QueryAnalysis } from "./types";

const DEMONSTRATIVE = /\b(isso|essa|esse|desse|dessa|aquilo|aquele|this|that|it)\b/;
/** Category nouns that name a kind of thing but not a specific one ("this car", "essa arma"). */
const CATEGORY = new Set(["car", "cars", "carro", "carros", "vehicle", "veiculo", "weapon", "arma", "armas", "mission", "missao", "character", "personagem", "item", "location", "local", "property", "propriedade", "motorcycle", "moto", "plane", "aviao", "helicopter", "helicoptero", "boat", "barco", "collectible", "coletavel", "cheat", "codigo", "existe", "existem", "exist", "exists"]);
const VAGUE = /\b(isso|essa|esse|desse|dessa|aquilo|aquele|this|that|it|melhor|best|quanto|custa|custo|price|cost|how much)\b/;

/**
 * An under-specified question ("How do I unlock this?", "Which is the best?", "How much is it?") with no entity,
 * no inherited conversation context and nothing topical to retrieve on. Answering it would mean guessing, so we ask.
 */
const PROTAGONISTS = new Set(Object.values(PROTAGONIST_IDS));

export function needsClarification(a: QueryAnalysis): boolean {
  // "Como faço isso com o Trevor?" with nothing earlier to point at: "isso" is unknown; the protagonist does not say what.
  if (!a.inheritedEntities.length && a.entities.length && a.entities.every((e) => PROTAGONISTS.has(e.id)) && DEMONSTRATIVE.test(normalize(a.original)) && tokenize(a.original).length <= 7) return true;
  if (a.entities.length || a.inheritedEntities.length || a.onlineBoundary.length) return false;
  const terms = topicalTerms(expandQuery(a.original));
  const n = normalize(a.original);
  if (tokenize(a.original).length > 7) return false;
  // Only a kind of thing and no name ("Qual missão?", "Which car?"): there is nothing specific to answer about.
  const content = contentTokens(a.original);
  if (content.length && content.length <= 2 && tokenize(a.original).length <= 4 && content.every((t) => CATEGORY.has(t))) return true;
  if (terms.length === 0) return VAGUE.test(n);
  // "Does this car exist in GTA 5?": only a kind of thing plus a demonstrative, nothing specific to look up.
  return DEMONSTRATIVE.test(n) && terms.every((t) => CATEGORY.has(t));
}

const TEXT = {
  pt: {
    answer: "Preciso de um pouco mais de contexto para responder com segurança. **A qual missão, item, veículo, arma ou personagem você se refere?**\n\nPor exemplo: *\"Como libero a missão Blitz Play?\"*, *\"Quanto custa o Sonar Collections Dock?\"* ou *\"Qual é a melhor abordagem do Big Score?\"*.",
    follow: [["Blitz Play: como liberar", "Como libero a missão Blitz Play?"], ["Quanto custa uma propriedade", "Quais propriedades posso comprar?"], ["Melhor abordagem do Big Score", "Qual é a melhor abordagem do Big Score?"]],
  },
  en: {
    answer: "I need a bit more context to answer safely. **Which mission, item, vehicle, weapon or character do you mean?**\n\nFor example: *\"How do I unlock Blitz Play?\"*, *\"How much is the Sonar Collections Dock?\"* or *\"What's the best Big Score approach?\"*.",
    follow: [["Unlock Blitz Play", "How do I unlock the mission Blitz Play?"], ["What properties can I buy?", "What properties can I buy?"], ["Best Big Score approach", "What's the best Big Score approach?"]],
  },
} as const;

export function clarificationFor(lang: Lang): { answer: string; followUps: Array<{ label: string; query: string }> } {
  const t = TEXT[lang];
  return { answer: t.answer, followUps: t.follow.map(([label, query]) => ({ label, query })) };
}
