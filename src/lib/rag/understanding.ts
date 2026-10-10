import { canonicalizeQuery, expandQuery } from "./glossary";
import { extractEntities, getEntityRef } from "./entities";
import { FOLLOW_UP_MARKERS, SPOILER_REQUEST, classifyIntents } from "./intents";
import { detectLang } from "./lang";
import { resolveMentions } from "./resolution";
import { normalize, tokenize } from "@/lib/text";
import type { ChatTurn, EntityRef, QueryAnalysis } from "./types";

const DEICTIC = /\b(essa|esse|dessa|desse|nessa|nesse|nela|nele|dela|dele|this|that|it|its|there)\b/;
const REFERENT_TYPES = new Set(["mission", "heist", "location", "character", "vehicle", "collectible", "ending"]);

/**
 * Query understanding: language → entity extraction → conversation-context resolution → intents.
 * Follow-ups ("and what's the best approach?") inherit the entities the assistant talked about last.
 */
export async function analyzeQuery(query: string, history: ChatTurn[] = []): Promise<QueryAnalysis> {
  const n = normalize(query);
  const canonical = canonicalizeQuery(query);
  const { matches, entities } = await extractEntities(query);
  const originalMatches = [...matches];
  // Community / Portuguese wording resolved through the canonical lexicon ("cartinhas" → Letter Scraps). Original
  // matches keep priority; the canonical pass only adds entities the original wording did not name.
  if (canonical !== n) {
    const extra = await extractEntities(canonical);
    for (const e of extra.entities) if (!entities.some((x) => x.id === e.id)) entities.push(e);
    for (const m of extra.matches) if (!matches.some((x) => x.alias === m.alias)) matches.push(m);
  }
  // Names the alias index did not resolve: near-miss corrections, unknown names, ambiguous generic nouns.
  const resolution = await resolveMentions(query, originalMatches, entities);
  for (const c of resolution.corrections) if (!entities.some((e) => e.id === c.to.id)) entities.push(c.to);
  for (const r of resolution.referents) if (!entities.some((e) => e.id === r.id)) entities.push(r);

  const lastAssistant = [...history].reverse().find((t) => t.role === "assistant" && t.entities?.length);
  const tokens = tokenize(query);
  const hasReferent = entities.some((e) => REFERENT_TYPES.has(e.type) && !e.onlineOnly);
  const deictic = DEICTIC.test(n);
  const looksFollowUp = !hasReferent && (FOLLOW_UP_MARKERS.test(n) || tokens.length <= 3);
  const isFollowUp = Boolean(lastAssistant) && (looksFollowUp || deictic);

  const inherited: EntityRef[] = [];
  if (isFollowUp && lastAssistant?.entities) {
    for (const id of lastAssistant.entities.slice(0, 3)) {
      const ref = await getEntityRef(id);
      if (ref && !entities.some((e) => e.id === ref.id) && (!hasReferent || (deictic && REFERENT_TYPES.has(ref.type)))) inherited.push(ref);
    }
  }

  const allForIntent = [...entities, ...inherited];
  const intents = classifyIntents(canonical === n ? query : `${query} ${canonical}`, allForIntent);
  const focusNames = inherited.map((e) => e.name).join(" ");
  const retrievalQuery = expandQuery([query, focusNames].filter(Boolean).join(" "));

  return {
    original: query,
    canonical,
    unresolved: resolution.unresolved,
    corrections: resolution.corrections,
    ambiguous: resolution.ambiguous,
    places: resolution.places,
    retrievalQuery,
    lang: detectLang(query),
    intents,
    matches,
    entities: entities.filter((e) => !e.onlineOnly),
    inheritedEntities: inherited,
    wantsSpoilers: SPOILER_REQUEST.test(n),
    onlineBoundary: entities.filter((e) => e.onlineOnly),
    isFollowUp,
  };
}
