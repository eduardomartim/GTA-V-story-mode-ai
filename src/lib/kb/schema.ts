import { z } from "zod";

export const ENTITY_TYPES = [
  "mission", "character", "vehicle", "weapon", "location", "property", "collectible", "random_event",
  "activity", "hobby", "achievement", "cheat", "heist", "ending", "business", "stock", "easter_egg",
  "troubleshooting", "game_mechanic", "version", "completion", "online_boundary",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const PREDICATES = [
  "requires", "involves", "participates_in", "takes_place_at", "located_in", "located_at", "found_at", "owns",
  "given_by", "part_of", "setup_for", "unlocks", "next", "related_to", "rewards", "drives",
] as const;
export type Predicate = (typeof PREDICATES)[number];

export const SourceDef = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  base_url: z.url(),
  source_type: z.enum(["official", "official-support", "wiki", "guide", "community"]),
  authority: z.number().int().min(1).max(10),
  notes: z.string().optional(),
});
export type SourceDef = z.infer<typeof SourceDef>;

export const SourceRef = z.object({
  source: z.string(),
  url: z.url(),
  confidence: z.number().min(0).max(1).default(0.8),
  source_date: z.string().optional(),
  retrieved_at: z.string().optional(),
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
  coord_precision: z.enum(["approximate", "verified", "unknown"]).default("approximate"),
  map_image: z.string().optional(),
  external_map_url: z.url().optional(),
});
export type LocationSpec = z.infer<typeof LocationSpec>;

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
  relations: z.array(z.object({ predicate: z.enum(PREDICATES), to: z.string() })).default([]),
  location: LocationSpec.optional(),
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
}
