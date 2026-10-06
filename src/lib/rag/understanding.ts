import { expandQuery } from "./glossary";
import { extractEntities, getEntityRef } from "./entities";
import { FOLLOW_UP_MARKERS, SPOILER_REQUEST, classifyIntents } from "./intents";
import { detectLang } from "./lang";
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
  const { matches, entities } = await extractEntities(query);

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
  const intents = classifyIntents(query, allForIntent);
  const focusNames = inherited.map((e) => e.name).join(" ");
  const retrievalQuery = expandQuery([query, focusNames].filter(Boolean).join(" "));

  return {
    original: query,
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
