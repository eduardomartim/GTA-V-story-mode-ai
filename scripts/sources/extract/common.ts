/**
 * Shared types and helpers for extractors (stage 2 of the ingestion pipeline: Source → **Extraction** → Normalization …).
 * Extractors read ONLY the local cache written by scripts/sources/fetch.ts — they never touch the network.
 */
import type { CompletionRequirement, EntityRecord, Predicate, SourceRef } from "../../../src/lib/kb/schema";
import { slugify } from "../../../src/lib/text";
import { readCached } from "../http";

export const GTW = "https://www.grandtheftwiki.com";
export const GTW_LICENSE = "CC BY-SA 3.0";

/** A relation whose target may be given by name; the import pipeline resolves names to entity ids. */
export interface DraftRelation {
  predicate: Predicate;
  to?: string;
  toName?: string;
  props?: Record<string, string | number | boolean>;
  status?: "verified" | "curated" | "unverified";
}

/** Extractor output. `merge: true` = enrich an existing entity with the same id instead of creating one. */
export type EntityDraft = Omit<EntityRecord, "relations" | "aliases" | "sections" | "attrs" | "versions" | "story_mode" | "online_only" | "spoiler_level" | "confidence" | "verification"> &
  Partial<Pick<EntityRecord, "aliases" | "sections" | "attrs" | "versions" | "story_mode" | "online_only" | "spoiler_level" | "confidence" | "verification">> & {
    relations?: DraftRelation[];
    merge?: boolean;
  };

export interface ExtractResult {
  name: string;
  entities: EntityDraft[];
  completion?: CompletionRequirement[];
  /** Problems the extractor noticed (count mismatches, unparsed rows…). They are reported, never hidden. */
  issues: string[];
}

export interface Page {
  url: string;
  title: string;
  html: string;
  retrievedAt: string; // YYYY-MM-DD
}

export function page(name: string): Page | null {
  const url = `${GTW}/${name}`;
  const c = readCached(url);
  if (!c || c.blocked || c.status !== 200) return null;
  const title = (c.body.match(/<title>([^<]+?)(?: - Grand Theft Wiki[^<]*)?<\/title>/)?.[1] ?? name.replace(/_/g, " ")).trim();
  return { url, title, html: c.body, retrievedAt: c.fetchedAt.slice(0, 10) };
}

export function gtwRef(p: Page, excerpt?: string, confidence = 0.75): SourceRef {
  return { source: "grandtheftwiki", url: p.url, title: p.title, retrieved_at: p.retrievedAt, confidence, ...(excerpt ? { excerpt: clip(excerpt, 300) } : {}) };
}

export function clip(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…`;
}

export const idFor = (type: string, name: string) => `${type}:${slugify(name)}`;

export const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, "twenty-five": 25, "twenty-seven": 27, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

export const PROTAGONISTS = { Michael: "character:michael-de-santa", Franklin: "character:franklin-clinton", Trevor: "character:trevor-philips" } as const;

/** "Franklin Clinton, Michael De Santa and Trevor Philips" / "All protagonists" → first names. */
export function protagonistsIn(text: string): string[] {
  if (/all (three )?protagonists|any protagonist|all characters/i.test(text)) return ["Michael", "Franklin", "Trevor"];
  return (["Michael", "Franklin", "Trevor"] as const).filter((p) => new RegExp(`\\b${p}\\b`).test(text));
}
