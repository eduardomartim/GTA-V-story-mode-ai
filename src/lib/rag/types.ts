import type { EntityType } from "@/lib/kb/schema";

export const INTENTS = [
  "mission_help", "mission_unlock", "mission_walkthrough", "mission_requirements", "mission_reward", "heist_strategy",
  "character_information", "vehicle_information", "weapon_information", "location_lookup", "collectible_lookup",
  "100_percent_completion", "random_event", "activity", "property", "money", "stock_market", "ending", "cheat",
  "easter_egg", "troubleshooting", "version_difference", "map_request", "image_request", "general_question",
] as const;
export type Intent = (typeof INTENTS)[number];

export type Lang = "pt" | "en";

export interface EntityRef {
  id: string;
  type: EntityType;
  name: string;
  onlineOnly: boolean;
  spoilerLevel: number;
}

export interface EntityMatch {
  alias: string;
  start: number;
  end: number;
  refs: EntityRef[];
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** Entity ids the assistant focused on in this turn (used to resolve "essa missão", "ela", …). */
  entities?: string[];
}

export interface QueryAnalysis {
  original: string;
  /** Query rewritten with conversation focus, glossary-expanded. Used for retrieval only. */
  retrievalQuery: string;
  lang: Lang;
  intents: Intent[];
  matches: EntityMatch[];
  /** Entities explicitly mentioned, strongest first. */
  entities: EntityRef[];
  /** Entities inherited from the previous turns because the question was a follow-up. */
  inheritedEntities: EntityRef[];
  wantsSpoilers: boolean;
  /** Online-only entities the user asked about (never answered as Story Mode content). */
  onlineBoundary: EntityRef[];
  isFollowUp: boolean;
}

export interface Candidate {
  chunkId: number;
  entityId: string;
  entityType: EntityType;
  entityName: string;
  contentType: string;
  content: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  sourceUrl: string;
  authority: number;
  confidence: number;
  verification: string;
  spoilerLevel: number;
  versions: string[];
  semantic: number; // 0..1 cosine similarity
  keyword: number; // 0..1 normalised ts_rank_cd
  entityScore: number; // 0..1
  via: Array<"entity" | "keyword" | "vector" | "graph">;
  score: number;
}

export interface SourceCardData {
  index: number;
  title: string;
  sourceName: string;
  sourceType: string;
  url: string;
  confidence: number;
  verification: string;
  entityId: string;
}

export interface FollowUp {
  label: string;
  query: string;
}

export type CardData =
  | { kind: "mission"; entityId: string; name: string; missionType: string; protagonists: string[]; giver?: string; sequence?: number; summary: string; approaches?: string[]; spoilerLevel: number; location?: { entityId: string; name: string } }
  | { kind: "character"; entityId: string; name: string; role?: string; playable: boolean; summary: string; ability?: string }
  | { kind: "vehicle"; entityId: string; name: string; category?: string; manufacturer?: string; summary: string; howToGet?: string; storyMode: boolean }
  | { kind: "weapon"; entityId: string; name: string; category?: string; summary: string }
  | { kind: "collectible"; entityId: string; name: string; total?: number; summary: string; reward?: string; versions: string[] }
  | { kind: "location"; entityId: string; name: string; region?: string; district?: string; mapX?: number; mapY?: number; gameX?: number; gameY?: number; precision: string; externalMapUrl?: string; summary: string }
  | { kind: "map"; entityId: string; name: string; mapX: number; mapY: number; gameX?: number; gameY?: number; precision: string; externalMapUrl?: string; markers: Array<{ id: string; name: string; mapX: number; mapY: number }> }
  | { kind: "image"; entityId?: string; title: string; url: string; isExternalLink: boolean; license: string; attribution?: string; source: string; sourceUrl?: string }
  | { kind: "warning"; tone: "online" | "unvalidated" | "version" | "info"; title: string; text: string }
  | { kind: "spoiler"; text: string }
  | { kind: "steps"; title: string; steps: string[] };

export type AnswerMode = "llm" | "structured" | "no-evidence" | "online-boundary" | "demo" | "clarify";

export interface ChatResult {
  requestId: string;
  answer: string; // markdown
  mode: AnswerMode;
  lang: Lang;
  cards: CardData[];
  sources: SourceCardData[];
  followUps: FollowUp[];
  spoiler: boolean;
  meta: {
    intents: Intent[];
    entities: string[];
    retrievalCount: number;
    latencyMs: number;
    /** Question terms that appear nowhere in the retrieved context (passed to the model as a hint). */
    unmatchedTerms?: string[];
    /** Open knowledge-backlog topics relevant to the question (information deliberately not invented). */
    gaps?: string[];
    /** false when the model cited no context block: the sources shown were consulted, not cited. */
    cited?: boolean;
    provider?: string;
    model?: string;
    usage?: { inputTokens?: number; outputTokens?: number };
    debug?: unknown;
  };
}
