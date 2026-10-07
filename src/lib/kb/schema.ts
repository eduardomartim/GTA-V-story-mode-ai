import { z } from "zod";

export const ENTITY_TYPES = [
  "mission", "character", "vehicle", "weapon", "location", "property", "collectible", "collectible_item", "random_event",
  "activity", "hobby", "achievement", "cheat", "heist", "ending", "business", "stock", "easter_egg",
  "troubleshooting", "game_mechanic", "version", "completion", "online_boundary",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const PREDICATES = [
  "requires", "involves", "participates_in", "takes_place_at", "located_in", "located_at", "found_at", "owns",
  "given_by", "part_of", "setup_for", "unlocks", "next", "related_to", "rewards", "drives",
  // v2 graph
  "available_to", "starts_at", "instance_of", "contributes_to", "hookup_with", "family_of", "friend_of",
  "appears_in", "required_for", "sells", "lives_at", "enemy_of", "works_for",
] as const;
export type Predicate = (typeof PREDICATES)[number];

export const SourceDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  base_url: z.url(),
  source_type: z.enum(["official", "official-support", "wiki", "guide", "community"]),
  authority: z.number().int().min(1).max(10),
  notes: z.string().optional(),
  /** Licence of the material taken from this source (e.g. "CC BY-SA 3.0", "GPL-3.0"); facts only when absent. */
  license: z.string().optional(),
});
export type SourceDef = z.infer<typeof SourceDef>;

export const SourceRef = z.object({
  source: z.string(),
  url: z.url(),
  confidence: z.number().min(0).max(1).default(0.8),
  source_date: z.string().optional(),
  retrieved_at: z.string().optional(),
  /** Page title at the source. */
  title: z.string().optional(),
  /** Short supporting excerpt (≤ 300 chars) for provenance; only from sources whose licence allows it. */
  excerpt: z.string().max(300).optional(),
});
export type SourceRef = z.infer<typeof SourceRef>;

/** VERIFIED = corroborated by ≥2 independent sources; CURATED = single source / author knowledge; UNVERIFIED = conflicting or weak. */
export const KNOWLEDGE_STATUSES = ["verified", "curated", "unverified"] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const AVAILABILITY = ["STORY_MODE", "ONLINE_ONLY", "BOTH", "UNKNOWN"] as const;
export type Availability = (typeof AVAILABILITY)[number];

export const Section = z.object({
  kind: z.string(),
  title: z.string(),
  text: z.string().min(10),
  /** Overrides the entity's verification for this section only. */
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
  /** Version scope when the fact differs by platform/edition. */
  versions: z.array(z.string()).optional(),
  /** Index into the entity's `sources` that backs this section (defaults to 0, the primary source). */
  src: z.number().int().min(0).optional(),
});

export const LocationSpec = z.object({
  region: z.string().optional(),
  district: z.string().optional(),
  game_x: z.number().optional(),
  game_y: z.number().optional(),
  game_z: z.number().optional(),
  coord_precision: z.enum(["approximate", "verified", "unknown", "community", "area"]).default("approximate"),
  /** Named area (district/town) when known, independently of coordinates. */
  area: z.string().optional(),
  /** Where the coordinates come from (source id). */
  coord_source: z.string().optional(),
  map_image: z.string().optional(),
  external_map_url: z.url().optional(),
});
export type LocationSpec = z.infer<typeof LocationSpec>;

export const Relation = z.object({
  predicate: z.enum(PREDICATES),
  to: z.string(),
  /** Qualifiers of the edge, e.g. { condition: "return her home after Hitch Lift 2" }. */
  props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  status: z.enum(KNOWLEDGE_STATUSES).optional(),
});
export type Relation = z.infer<typeof Relation>;

export const ItemSpec = z.object({
  category: z.string().regex(/^collectible:[a-z0-9-]+$/),
  kind: z.string(),
  /** Position in the source list; NOT an official in-game index unless the source says so. */
  number: z.number().int().positive().optional(),
  area: z.string().optional(),
  region: z.string().optional(),
  counts_for_100: z.boolean().optional(),
  protagonists: z.array(z.string()).default([]),
});
export type ItemSpec = z.infer<typeof ItemSpec>;

export const COMPLETION_CATEGORIES = ["missions", "strangers_and_freaks", "hobbies_and_pastimes", "random_events", "miscellaneous", "not_required"] as const;

export const CompletionRequirement = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  category: z.enum(COMPLETION_CATEGORIES),
  label: z.string(),
  required_count: z.number().int().nonnegative().optional(),
  total_count: z.number().int().nonnegative().optional(),
  protagonists: z.array(z.string()).default([]),
  target_ids: z.array(z.string()).default([]),
  source: z.string(),
  url: z.url(),
  status: z.enum(KNOWLEDGE_STATUSES).default("curated"),
  notes: z.string().optional(),
});
export type CompletionRequirement = z.infer<typeof CompletionRequirement>;

export const EntityRecord = z.object({
  id: z.string().regex(/^[a-z_]+:[a-z0-9-]+$/),
  type: z.enum(ENTITY_TYPES),
  name: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  summary: z.string().min(10),
  story_mode: z.boolean().default(true),
  online_only: z.boolean().default(false),
  spoiler_level: z.number().int().min(0).max(3).default(0),
  versions: z.array(z.string()).default([]),
  verification: z.enum(["verified", "curated", "unverified"]).default("curated"),
  confidence: z.number().min(0).max(1).default(0.8),
  sources: z.array(SourceRef).min(1),
  attrs: z.record(z.string(), z.unknown()).default({}),
  sections: z.array(Section).default([]),
  relations: z.array(Relation).default([]),
  location: LocationSpec.optional(),
  /** Item-level collectible / challenge (type collectible_item). */
  item: ItemSpec.optional(),
});
export type EntityRecord = z.infer<typeof EntityRecord>;

export const AssetRecord = z.object({
  id: z.string(),
  title: z.string(),
  asset_type: z.enum(["character", "vehicle", "weapon", "location", "map", "mission", "collectible", "diagram"]),
  url: z.string(),
  thumbnail_url: z.string().optional(),
  source: z.string(),
  source_url: z.url().optional(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  license: z.string(),
  attribution: z.string().optional(),
});
export type AssetRecord = z.infer<typeof AssetRecord>;

export const BacklogItem = z.object({
  topic: z.string(),
  entity_id: z.string().optional(),
  note: z.string(),
});
export type BacklogItem = z.infer<typeof BacklogItem>;

export interface KnowledgeBase {
  sources: SourceDef[];
  entities: EntityRecord[];
  assets: AssetRecord[];
  backlog: BacklogItem[];
  completion: CompletionRequirement[];
}
