import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CompletionRequirement, EntityRecord, LocationSpec, SourceRef } from "./schema";

/**
 * Third-party datasets live OUTSIDE the application code, one directory per licence, and are combined with the
 * project's own knowledge base only when the database is seeded (see DATA_LICENSES.md):
 *
 *   datasets/grandtheftwiki/   CC BY-SA 3.0 — records extracted/adapted from Grand Theft Wiki (+ the 100% checklist)
 *   datasets/esx-collectables/ GPL-3.0      — community coordinates from Mobius1/esx_collectables and data derived
 *                                            from them only (position-only items, coordinate attachments, coastline)
 *
 * No file holds material under both licences (CC BY-SA 3.0 is not compatible with GPL-3.0). A described item that
 * also has a community coordinate is stored twice-split: its description in the CC BY-SA file, its coordinate as an
 * "attachment" (keyed by entity id) in the GPL file. Both datasets are optional at load time: the application runs on
 * its own knowledge base without them.
 */
export const DATASETS_DIR = path.join(process.cwd(), "datasets");
export const GTW_DIR = "grandtheftwiki";
export const ESX_DIR = "esx-collectables";
export const ESX_SOURCE = "esx-collectables";

/** Coordinate fields that come from the GPL dataset. */
const COORD_KEYS = ["game_x", "game_y", "game_z", "coord_precision", "coord_source"] as const;
/** Entity attrs written by the coordinate pairing step (describe the GPL coordinate, so they live with it). */
const COORD_ATTRS = ["coordinate_pairing"] as const;

export const CoordinateAttachment = z.object({
  entity_id: z.string(),
  /** Position of the esx source in the entity's `sources` (kept so the merged record is identical). */
  source_index: z.number().int().nonnegative(),
  source: SourceRef,
  location: LocationSpec.partial(),
  attrs: z.record(z.string(), z.unknown()).default({}),
});
export type CoordinateAttachment = z.infer<typeof CoordinateAttachment>;

export const EsxDataset = z.object({
  /** Records whose only source is esx_collectables (position-only points). */
  entities: z.array(EntityRecord),
  /** Coordinates paired with records described elsewhere (the description stays in its own dataset). */
  attachments: z.array(CoordinateAttachment),
  /** For each position-only record, the id of the record it followed in the pipeline output (null = first). Keeps
   *  the combined order identical to the pipeline's, so seeding is reproducible. */
  after: z.record(z.string(), z.string().nullable()).default({}),
});
export type EsxDataset = z.infer<typeof EsxDataset>;

const isEsx = (s: { source: string }) => s.source === ESX_SOURCE;

/** Splits pipeline output by licence: everything except GPL material → CC BY-SA file; GPL material → esx file. */
export function splitByLicence(records: EntityRecord[]): { gtw: EntityRecord[]; esx: EsxDataset } {
  const gtw: EntityRecord[] = [];
  const esx: EsxDataset = { entities: [], attachments: [], after: {} };
  let prev: string | null = null;
  for (const r of records) {
    const before = prev;
    prev = r.id;
    const idx = r.sources.findIndex(isEsx);
    if (idx < 0 && r.location?.coord_source !== ESX_SOURCE) {
      gtw.push(r);
      continue;
    }
    if (r.sources.every(isEsx)) {
      esx.entities.push(r);
      esx.after[r.id] = before;
      continue;
    }
    if (idx < 0 || r.sections.some((s) => s.src !== undefined)) throw new Error(`Cannot split ${r.id}: unexpected shape for a paired coordinate`);
    const location: Partial<LocationSpec> = {};
    const rest: Record<string, unknown> = { ...(r.location ?? {}) };
    for (const k of COORD_KEYS) if (k in rest) { (location as Record<string, unknown>)[k] = rest[k]; delete rest[k]; }
    const attrs: Record<string, unknown> = {};
    const keptAttrs: Record<string, unknown> = { ...r.attrs };
    for (const k of COORD_ATTRS) if (k in keptAttrs) { attrs[k] = keptAttrs[k]; delete keptAttrs[k]; }
    esx.attachments.push({ entity_id: r.id, source_index: idx, source: r.sources[idx] as SourceRef, location, attrs });
    // Without the coordinate, the described record is known at area level only.
    gtw.push({ ...r, sources: r.sources.filter((_, i) => i !== idx), attrs: keptAttrs, location: { ...(rest as LocationSpec), coord_precision: "area" } });
  }
  return { gtw, esx };
}

/** Inverse of splitByLicence: applies the GPL dataset (if present) to the other records. */
export function applyEsxDataset(records: EntityRecord[], esx: EsxDataset | null): EntityRecord[] {
  if (!esx) return records;
  const att = new Map(esx.attachments.map((a) => [a.entity_id, a]));
  const merged = records.map((r) => {
    const a = att.get(r.id);
    if (!a) return r;
    const sources = [...r.sources];
    sources.splice(a.source_index, 0, a.source);
    return { ...r, sources, attrs: { ...r.attrs, ...a.attrs }, location: { ...(r.location ?? {}), ...a.location } as LocationSpec };
  });
  // Re-insert position-only records where the pipeline emitted them.
  const following = new Map<string | null, EntityRecord[]>();
  for (const e of esx.entities) {
    const key = esx.after[e.id] ?? null;
    following.set(key, [...(following.get(key) ?? []), e]);
  }
  const out: EntityRecord[] = [];
  const emitAfter = (id: string | null) => {
    for (const e of following.get(id) ?? []) { out.push(e); emitAfter(e.id); }
    following.delete(id);
  };
  emitAfter(null);
  for (const r of merged) { out.push(r); emitAfter(r.id); }
  for (const rest of following.values()) out.push(...rest); // anchors that no longer exist: append
  return out;
}

const readJson = (f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as unknown;

/** The CC BY-SA dataset (records + 100% checklist); empty when the directory is absent. */
export function loadGtwDataset(dir = DATASETS_DIR): { entities: EntityRecord[]; completion: CompletionRequirement[] } {
  const base = path.join(dir, GTW_DIR);
  const ents = path.join(base, "entities.json");
  const comp = path.join(base, "completion.json");
  return {
    entities: fs.existsSync(ents) ? z.array(EntityRecord).parse(readJson(ents)) : [],
    completion: fs.existsSync(comp) ? z.array(CompletionRequirement).parse(readJson(comp)) : [],
  };
}

/** The GPL dataset, or null when it is absent (the application then has no community coordinates). */
export function loadEsxDataset(dir = DATASETS_DIR): EsxDataset | null {
  const f = path.join(dir, ESX_DIR, "coordinates.json");
  return fs.existsSync(f) ? EsxDataset.parse(readJson(f)) : null;
}

/** Coastline traced from the GPL coordinates (served at runtime by /api/map, never bundled), or null. */
export function loadCoastline(dir = DATASETS_DIR): Array<Array<[number, number]>> | null {
  const f = path.join(dir, ESX_DIR, "land.json");
  if (!fs.existsSync(f)) return null;
  const shapes = (readJson(f) as { shapes?: unknown }).shapes;
  return z.array(z.array(z.tuple([z.number(), z.number()]))).parse(shapes);
}
