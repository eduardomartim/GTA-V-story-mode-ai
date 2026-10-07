/**
 * Ingestion pipeline, stages 3–7 (after Source → Extraction):
 *
 *   Normalization → Entity resolution → Coordinates (link / create) → Merge + Deduplication
 *   → Story/Online contamination check → Confidence → Validation → generated KB files
 *
 * Inputs : the hand-curated KB (data/kb/entities-*.json, excluding generated files), extractor outputs
 *          (datasets/grandtheftwiki/extracted/*.json), community coordinates (esx_collectables), the area gazetteer
 *          (data/gazetteer.json).
 * Outputs: written by scripts/kb/import.ts, split by licence into datasets/grandtheftwiki/ and datasets/esx-collectables/.
 * Database load + embeddings stay in `npm run db:seed`; evaluation in `npm run evaluate*`.
 *
 * Policies (never relaxed): a record without a source is rejected; Online-only content is rejected;
 * statuses are never upgraded automatically (UNVERIFIED stays UNVERIFIED); conflicts are recorded, not resolved.
 */
import type { CompletionRequirement, EntityRecord, KnowledgeStatus, Relation, SourceRef } from "../../src/lib/kb/schema";
import { EntityRecord as EntitySchema } from "../../src/lib/kb/schema";
import { normalize, slugify } from "../../src/lib/text";
import type { CompletionDraft } from "../sources/extract/completion";
import type { DraftRelation, EntityDraft } from "../sources/extract/common";
import type { CoordSet } from "../sources/extract/coords-esx";

export interface GazetteerArea { name: string; region: string; x: number; y: number; aliases?: string[] }

export interface PipelineInput {
  base: EntityRecord[];
  drafts: EntityDraft[];
  completion: CompletionDraft[];
  coords?: { sets: CoordSet[]; retrievedAt: string; repoUrl: string };
  gazetteer: GazetteerArea[];
  onlineTerms: string[];
}

export interface PipelineReport {
  counts: Record<string, number>;
  merged: string[];
  conflicts: Array<{ entity: string; field: string; values: string[] }>;
  rejected: Array<{ id: string; reason: string }>;
  unresolved: Array<{ from: string; predicate: string; name: string }>;
  coordinateLinks: Array<{ category: string; linked: number; unlinked: number; created: number; meanResidual?: number; agreeingArea?: number }>;
  warnings: string[];
}

export interface PipelineOutput { entities: EntityRecord[]; completion: CompletionRequirement[]; report: PipelineReport }

const STATUS_RANK: Record<KnowledgeStatus, number> = { unverified: 0, curated: 1, verified: 2 };
const weaker = (a: KnowledgeStatus, b: KnowledgeStatus): KnowledgeStatus => (STATUS_RANK[a] <= STATUS_RANK[b] ? a : b);

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function nearestArea(gaz: GazetteerArea[], pt: { x: number; y: number }): { area: GazetteerArea; d: number } | null {
  let best: { area: GazetteerArea; d: number } | null = null;
  for (const a of gaz) {
    const d = dist(a, pt);
    if (!best || d < best.d) best = { area: a, d };
  }
  return best;
}

function gazIndex(gaz: GazetteerArea[]): Map<string, GazetteerArea> {
  const m = new Map<string, GazetteerArea>();
  for (const a of gaz) for (const n of [a.name, ...(a.aliases ?? [])]) m.set(normalize(n), a);
  return m;
}

/* ───────────── normalization ───────────── */
const ONLINE_SENTENCE = /\b(GTA Online|Grand Theft Auto Online)\b/i;

/**
 * Story Mode isolation at sentence level: sentences about GTA Online are dropped from imported text, unless the
 * sentence contrasts it with Story Mode ("…in Story Mode, or … in GTA Online"), which is useful and kept.
 */
export function stripOnlineSentences(text: string): { text: string; removed: number } {
  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  // Kept: contrastive sentences ("in Story Mode … in GTA Online") and neutral "appears in GTA V and GTA Online" ones.
  const neutral = /appears? in (Grand Theft Auto V|GTA V)( and| as well as)? (in )?(Grand Theft Auto|GTA) Online/i;
  const kept = parts.filter((p) => !ONLINE_SENTENCE.test(p) || /story mode/i.test(p) || neutral.test(p));
  return { text: kept.join(" "), removed: parts.length - kept.length };
}

function normalizeDraft(d: EntityDraft, report?: PipelineReport): EntityDraft {
  const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s+([.,;:])/g, "$1").trim();
  let removed = 0;
  const story = (s: string) => {
    const r = stripOnlineSentences(clean(s));
    removed += r.removed;
    return r.text;
  };
  const out: EntityDraft = {
    ...d,
    name: clean(d.name),
    summary: story(d.summary) || clean(d.summary),
    aliases: [...new Set((d.aliases ?? []).map(clean).filter((a) => a && normalize(a) !== normalize(d.name)))],
    sections: (d.sections ?? []).map((s) => ({ ...s, title: clean(s.title), text: story(s.text) })).filter((s) => s.text.length >= 10),
  };
  if (removed && report) report.warnings.push(`${d.id}: ${removed} sentence(s) about GTA Online removed (Story Mode only)`);
  return out;
}

/* ───────────── main ───────────── */
export function runPipeline(input: PipelineInput): PipelineOutput {
  const report: PipelineReport = { counts: {}, merged: [], conflicts: [], rejected: [], unresolved: [], coordinateLinks: [], warnings: [] };
  const gaz = gazIndex(input.gazetteer);
  const onlineNorm = input.onlineTerms.map(normalize).filter((t) => t.length >= 5);

  // 1) Normalize + reject records without sources / Online-only content.
  const drafts: EntityDraft[] = [];
  for (const raw of input.drafts) {
    const d = normalizeDraft(raw, report);
    if (!d.sources?.length) { report.rejected.push({ id: d.id, reason: "no source" }); continue; }
    if (d.sources.some((s) => !s.url.startsWith("https://"))) { report.rejected.push({ id: d.id, reason: "non-https source" }); continue; }
    if (d.online_only || d.type === "online_boundary") { report.rejected.push({ id: d.id, reason: "GTA Online content is not imported as Story Mode knowledge" }); continue; }
    const nameNorm = normalize(d.name);
    if (onlineNorm.some((t) => nameNorm === t)) { report.rejected.push({ id: d.id, reason: `name matches a GTA Online-only entity (${d.name})` }); continue; }
    const text = normalize(`${d.summary} ${(d.sections ?? []).map((s) => s.text).join(" ")}`);
    if (/\bgta online\b/.test(text)) report.warnings.push(`${d.id}: mentions GTA Online — kept, but the text should be reviewed for Online-only facts`);
    drafts.push(d);
  }

  // 2) Coordinates. Community coordinates carry no description, so a coordinate is attached to a described item
  //    ONLY when the pairing is unambiguous: the item is the only described item of its area in this category AND
  //    exactly one coordinate has that area as its nearest named area. Everything else stays a position-only point,
  //    explicitly labelled — a wrong pairing would put a correct description on the wrong spot.
  const coordDrafts: EntityDraft[] = [];
  if (input.coords) {
    const { sets, retrievedAt, repoUrl } = input.coords;
    const coordRef: SourceRef = { source: "esx-collectables", url: repoUrl, title: "esx_collectables config.lua", retrieved_at: retrievedAt, confidence: 0.7 };
    for (const set of sets) {
      const described = drafts.filter((d) => d.type === "collectible_item" && d.item?.category === set.category);
      const stat = { category: set.category, linked: 0, unlinked: 0, created: 0 } as PipelineReport["coordinateLinks"][number];
      const kind = described[0]?.item?.kind ?? set.title.replace(/Parts$/, "Part").replace(/s$/, "");
      const nearOf = new Map(set.points.map((pt) => [pt, nearestArea(input.gazetteer, pt)]));
      const paired = new Set<CoordSet["points"][number]>();
      const residuals: number[] = [];
      const byArea = new Map<string, EntityDraft[]>();
      for (const d of described) {
        const k = normalize(d.item?.area ?? "");
        byArea.set(k, [...(byArea.get(k) ?? []), d]);
      }
      for (const [areaKey, items] of byArea) {
        const area = gaz.get(areaKey);
        const pts = set.points.filter((pt) => area && nearOf.get(pt)?.area.name === area.name);
        if (items.length !== 1 || pts.length !== 1 || !area) { stat.unlinked += items.length; continue; }
        const d = items[0] as EntityDraft;
        const pt = pts[0] as CoordSet["points"][number];
        paired.add(pt);
        residuals.push(dist(area, pt));
        d.location = { ...(d.location ?? { coord_precision: "area" }), game_x: pt.x, game_y: pt.y, game_z: pt.z, coord_precision: "community", coord_source: "esx-collectables" };
        d.sources = [...d.sources, coordRef];
        d.attrs = { ...(d.attrs ?? {}), coordinate_pairing: `community coordinate (esx_collectables #${pt.n}); paired because it is the only coordinate and the only described ${kind.toLowerCase()} in ${area.name} — automatic pairing, not independently verified` };
        stat.linked++;
      }
      stat.meanResidual = residuals.length ? Math.round(residuals.reduce((a, b) => a + b, 0) / residuals.length) : undefined;

      // Remaining coordinates: position-only points. When the category has a described list they get no number
      // (the described list owns the numbering); otherwise they are numbered in dataset order.
      const numbered = described.length === 0;
      for (const pt of set.points) {
        if (paired.has(pt)) continue;
        const near = nearOf.get(pt) ?? null;
        const k = pt.n + (set.points[0]?.n === 0 ? 1 : 0);
        const label = numbered ? `${kind} #${k}` : `${kind} position ${k} (community dataset)`;
        coordDrafts.push({
          id: `collectible_item:${slugify(kind)}-${numbered ? "" : "pos-"}${k}`,
          type: "collectible_item",
          name: `${label}${near ? ` — near ${near.area.name}` : ""}`,
          aliases: numbered ? [`${kind} ${k}`, `${kind} #${k}`] : [],
          summary: `${numbered ? kind : `A ${kind.toLowerCase()} position`} at community-measured in-game coordinates x ${pt.x.toFixed(1)}, y ${pt.y.toFixed(1)}, z ${pt.z.toFixed(1)}${pt.z < 0 ? " (under water)" : ""}${near ? `; nearest named area: ${near.area.name} (${near.area.region}) — the area name is approximate` : ""}.${numbered ? " No written description is available in the knowledge base for this item." : ` Which of the described ${kind.toLowerCase()}s it corresponds to has not been established.`}`,
          verification: "curated",
          confidence: 0.65,
          sources: [coordRef],
          attrs: { numbering: numbered ? "order of the esx_collectables dataset (not an official in-game index)" : "unpaired community coordinate", ...(numbered ? {} : { position_only: true }), ...(pt.z < 0 ? { underwater: true } : {}) },
          relations: [{ predicate: "instance_of", to: set.category }, ...(near ? [{ predicate: "located_in" as const, toName: near.area.name }] : [])],
          location: { game_x: pt.x, game_y: pt.y, game_z: pt.z, coord_precision: "community", coord_source: "esx-collectables", area: near?.area.name, region: near?.area.region },
          item: { category: set.category, kind, ...(numbered ? { number: k } : {}), area: near?.area.name, region: near?.area.region, protagonists: [] },
        });
        stat.created++;
      }
      report.coordinateLinks.push(stat);
    }
  }


  // 3) Area entities: every referenced area becomes a location entity (if the KB does not already have it).
  const all: EntityDraft[] = [...drafts, ...coordDrafts];
  const nameIndex = new Map<string, Set<string>>();
  const addName = (n: string, id: string) => {
    const k = normalize(n);
    if (!k) return;
    if (!nameIndex.has(k)) nameIndex.set(k, new Set());
    nameIndex.get(k)?.add(id);
  };
  const baseById = new Map(input.base.map((e) => [e.id, e]));
  for (const e of input.base) for (const n of [e.name, ...e.aliases, e.name.replace(/^the /i, "")]) addName(n, e.id);
  for (const d of all) for (const n of [d.name, ...(d.aliases ?? [])]) addName(n, d.id);

  const areaDrafts = new Map<string, EntityDraft>();
  const PLACE_PREDICATES = new Set(["located_in", "starts_at", "lives_at"]);
  const queue = [...all];
  for (let qi = 0; qi < queue.length; qi++) {
    const d = queue[qi] as EntityDraft;
    for (const r of d.relations ?? []) {
      if (!PLACE_PREDICATES.has(r.predicate) || !r.toName) continue;
      // Only an existing PLACE with that name counts (an easter egg or mission named after a place must not block it).
      const isPlace = (id: string) => id.startsWith("location:");
      if ([...(nameIndex.get(normalize(r.toName)) ?? [])].some(isPlace)) continue;
      // Short form of an existing place ("Darnell Bros." → "Darnell Bros. Garment Factory"): resolve, don't duplicate.
      const shortKey = normalize(r.toName);
      const longer = shortKey.split(" ").length >= 2 ? input.base.find((b) => b.type === "location" && normalize(b.name).startsWith(`${shortKey} `)) : undefined;
      if (longer) { addName(r.toName, longer.id); report.warnings.push(`place "${r.toName}" resolved to existing ${longer.id}`); continue; }
      const key = normalize(r.toName);
      if (areaDrafts.has(key)) continue;
      const g = gaz.get(key);
      const regionRaw = g?.region ?? (r.predicate === "located_in" ? (d.location?.region ?? d.item?.region) : undefined);
      const region = regionRaw && normalize(regionRaw) !== key ? regionRaw : undefined;
      const src = d.sources[0] as SourceRef;
      const id = `location:${slugify(r.toName)}`;
      if (baseById.has(id)) { addName(r.toName, id); continue; }
      const created: EntityDraft = {
        id, type: "location", name: r.toName,
        summary: `${r.toName} — a named area of San Andreas${region ? ` in ${region}` : ""}, referenced by ${src.title ?? src.source} as the location of in-game content.`,
        verification: "curated", confidence: 0.6,
        sources: [{ source: src.source, url: src.url, title: src.title, retrieved_at: src.retrieved_at, confidence: 0.6 }],
        attrs: { kind: "area" },
        relations: region ? [{ predicate: "located_in", toName: region }] : [],
        location: { area: r.toName, region, ...(g ? { game_x: g.x, game_y: g.y } : {}), coord_precision: g ? "approximate" : "area" },
      };
      areaDrafts.set(key, created);
      queue.push(created); // its own region may need an entity too
      addName(r.toName, id);
    }
  }
  all.push(...areaDrafts.values());
  report.counts.areas_created = areaDrafts.size;

  // 4) Merge: drafts with an existing id (or explicit merge) enrich that entity; duplicates among drafts are merged.
  const out = new Map<string, EntityRecord>(input.base.map((e) => [e.id, structuredClone(e)]));
  const newIds = new Set<string>();
  const itemSlots = new Map<string, string>();
  const idMap = new Map<string, string>();
  for (const raw of all) {
    // Entity resolution by name: the same mission/character under a different id slug ("Chop (mission)" vs "Chop").
    let d = raw;
    if (!out.has(d.id) && !d.merge) {
      const same = [...(nameIndex.get(normalize(d.name)) ?? [])].find((id) => id !== d.id && id.split(":")[0] === d.type && baseById.has(id));
      if (same) { d = { ...d, id: same }; report.warnings.push(`${raw.id}: resolved by name to existing ${same}`); }
    }
    idMap.set(raw.id, d.id);
    if (d.type === "mission" && !out.has(d.id) && !d.attrs?.mission_type) {
      d = { ...d, attrs: { ...(d.attrs ?? {}), mission_type: "side" } };
      report.warnings.push(`${d.id}: mission not in the curated story list — imported as a side mission`);
    }
    if (d.item?.number) {
      const slot = `${d.item.category}#${d.item.number}`;
      const prev = itemSlots.get(slot);
      if (prev && prev !== d.id) { report.rejected.push({ id: d.id, reason: `duplicate item slot ${slot} (already ${prev})` }); continue; }
      itemSlots.set(slot, d.id);
    }
    const existing = out.get(d.id);
    if (!existing) {
      if (d.merge) { report.warnings.push(`${d.id}: merge requested but no such entity exists — skipped`); continue; }
      out.set(d.id, toRecord(d));
      newIds.add(d.id);
      continue;
    }
    mergeInto(existing, d, report);
    report.merged.push(d.id);
  }

  // 5) Resolve relation names → ids (type-aware), drop unresolvable ones (reported).
  const PREFERRED_TYPE: Partial<Record<string, string[]>> = {
    located_in: ["location"], lives_at: ["location"], starts_at: ["location"], available_to: ["character"], hookup_with: ["character"],
    given_by: ["character"], family_of: ["character"], friend_of: ["character"], instance_of: ["collectible"], unlocks: ["mission", "vehicle", "activity", "collectible"],
    requires: ["mission", "collectible"], appears_in: ["mission"],
  };
  const draftRels = new Map<string, DraftRelation[]>();
  for (const d of all) {
    const id = idMap.get(d.id) ?? d.id;
    draftRels.set(id, [...(draftRels.get(id) ?? []), ...(d.relations ?? [])]);
  }
  for (const [id, rels] of draftRels) {
    const target = out.get(id);
    if (!target) continue;
    const resolved: Relation[] = [];
    for (const r of rels as DraftRelation[]) {
      let to = r.to;
      if (!to && r.toName) {
        const cands = lookupName(nameIndex, r.toName).filter((c) => out.has(c) && c !== id);
        const pref = PREFERRED_TYPE[r.predicate];
        // Same name, several entities (the Paleto Score mission AND heist): prefer the predicate's type, else a fixed type order.
        const ORDER = ["mission", "heist", "character", "location", "random_event", "activity", "hobby", "collectible", "vehicle", "weapon", "easter_egg"];
        const byOrder = [...cands].sort((x, y) => (ORDER.indexOf(x.split(":")[0] as string) + 99) % 99 - (ORDER.indexOf(y.split(":")[0] as string) + 99) % 99);
        to = (pref ? cands.find((c) => pref.includes(c.split(":")[0] as string)) : undefined) ?? (cands.length === 1 ? cands[0] : r.predicate === "related_to" || r.predicate === "appears_in" ? byOrder[0] : undefined);
      }
      if (!to || !out.has(to)) { report.unresolved.push({ from: id, predicate: r.predicate, name: r.toName ?? r.to ?? "?" }); continue; }
      resolved.push({ predicate: r.predicate, to, ...(r.props ? { props: r.props } : {}), ...(r.status ? { status: r.status } : {}) });
    }
    const seen = new Set(target.relations.map((r) => `${r.predicate}|${r.to}`));
    for (const r of resolved) if (!seen.has(`${r.predicate}|${r.to}`)) { target.relations.push(r); seen.add(`${r.predicate}|${r.to}`); }
  }

  // 6) Completion requirements: resolve target names.
  const completion: CompletionRequirement[] = input.completion.map((c) => {
    const ids = new Set<string>();
    for (const n of c.target_names) {
      const cands = lookupName(nameIndex, n).filter((x) => out.has(x));
      const pick = cands.find((x) => /^(mission|collectible|character|activity|hobby|completion):/.test(x)) ?? cands[0];
      if (pick) ids.add(pick);
      else report.unresolved.push({ from: `completion:${c.id}`, predicate: "targets", name: n });
    }
    const { target_names: _names, ...rest } = c;
    void _names;
    return { ...rest, target_ids: [...ids] };
  });

  // 7) Final schema validation of imported/merged records.
  const entities: EntityRecord[] = [];
  for (const e of out.values()) {
    const parsed = EntitySchema.safeParse(e);
    if (!parsed.success) { report.rejected.push({ id: e.id, reason: `schema: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}` }); continue; }
    entities.push(parsed.data);
  }
  report.counts.new_entities = [...newIds].filter((id) => entities.some((e) => e.id === id)).length;
  report.counts.merged = report.merged.length;
  report.counts.completion_requirements = completion.length;
  report.counts.rejected = report.rejected.length;
  report.counts.unresolved_relations = report.unresolved.length;
  return { entities, completion, report };
}

/**
 * Name lookup with the variants sources use for the same thing: "Prologue (GTA V)", "Predator (mission)",
 * "By the Book (Boss))", "The Paleto Score" / "Paleto Score", "Humane Labs & Research" / "and Research".
 */
export function nameVariants(name: string): string[] {
  const base = name.replace(/\s*\([^)]*\)+\s*$/, "").trim();
  const out = [name, base, base.replace(/^the /i, ""), `The ${base}`, base.replace(/&/g, "and"), base.replace(/\s+and\s+/gi, " & "), base.replace(/ (Research|Inc\.?|Ltd\.?)$/i, "")];
  return [...new Set(out.filter(Boolean))];
}

function lookupName(index: Map<string, Set<string>>, name: string): string[] {
  for (const v of nameVariants(name)) {
    const hit = index.get(normalize(v));
    if (hit?.size) return [...hit];
  }
  return [];
}

function toRecord(d: EntityDraft): EntityRecord {
  return {
    id: d.id, type: d.type, name: d.name, aliases: d.aliases ?? [], summary: d.summary,
    story_mode: d.story_mode ?? true, online_only: false, spoiler_level: d.spoiler_level ?? 0, versions: d.versions ?? [],
    verification: d.verification ?? "curated", confidence: d.confidence ?? 0.75, sources: d.sources, attrs: d.attrs ?? {},
    sections: d.sections ?? [], relations: [], ...(d.location ? { location: d.location } : {}), ...(d.item ? { item: d.item } : {}),
  } as EntityRecord;
}

/** Enrich `e` with `d`: new sources/sections/aliases are added; scalar attribute disagreements become recorded conflicts. */
function mergeInto(e: EntityRecord, d: EntityDraft, report: PipelineReport): void {
  const offset = new Map<number, number>();
  d.sources.forEach((s, i) => {
    const at = e.sources.findIndex((x) => x.url === s.url);
    if (at >= 0) offset.set(i, at);
    else { e.sources.push(s); offset.set(i, e.sources.length - 1); }
  });
  const known = new Set(e.aliases.map(normalize).concat(normalize(e.name)));
  for (const a of d.aliases ?? []) if (!known.has(normalize(a))) { e.aliases.push(a); known.add(normalize(a)); }
  const texts = new Set(e.sections.map((s) => normalize(s.text)));
  for (const s of d.sections ?? []) {
    if (texts.has(normalize(s.text))) continue;
    e.sections.push({ ...s, src: offset.get(s.src ?? 0) ?? 0 });
    texts.add(normalize(s.text));
  }
  for (const [k, v] of Object.entries(d.attrs ?? {})) {
    const cur = e.attrs[k];
    if (cur === undefined) { e.attrs[k] = v; continue; }
    // A curated availability decision (STORY_MODE / BOTH / UNKNOWN …) is more specific than a roster-level default.
    if (k === "availability") continue;
    // Same value, or one is a more detailed form of the other ("Rockford Hills" ⊂ "De Santa House in Rockford Hills"): not a conflict.
    const a = typeof cur === "string" ? normalize(cur) : JSON.stringify(cur);
    const b = typeof v === "string" ? normalize(v) : JSON.stringify(v);
    // Money/number formatting is not a disagreement: 200000 ≡ "$200,000".
    const digits = (x: unknown) => String(x).replace(/[^\d]/g, "");
    const sameNumber = /\d/.test(String(cur)) && digits(cur).length >= 3 && digits(cur) === digits(v) && !/[a-z]{3,}/i.test(String(v).replace(/^\$/, ""));
    const same = a === b || sameNumber || (typeof cur === "string" && typeof v === "string" && (a.includes(b) || b.includes(a)));
    if (same && typeof v === "string" && typeof cur === "string" && v.length > cur.length) { e.attrs[k] = v; continue; }
    if (!same && ["string", "number", "boolean"].includes(typeof v) && ["string", "number", "boolean"].includes(typeof cur)) {
      report.conflicts.push({ entity: e.id, field: k, values: [String(cur), String(v)] });
      const existing = e.sources[0];
      const incoming = d.sources[0];
      const field = k.replace(/_/g, " ");
      // Same layout as the curated conflicts already in the KB (Source A / Source B / Difference / Confidence).
      e.sections.push({ kind: "conflict", title: `Sources differ on ${field}`, status: "unverified",
        text: `Source A: ${existing?.title ?? existing?.source ?? "existing record"}: ${field} ${String(cur)}. Source B: ${incoming?.title ?? incoming?.source ?? "new source"}: ${field} ${String(v)}. Difference: ${field}. Confidence in either version: 50%. The sources diverge, so treat this detail as unconfirmed.`,
        src: offset.get(0) ?? 0 });
      e.verification = weaker(e.verification, "curated");
    }
  }
  if (d.location && !e.location) e.location = d.location;
  if (d.item && !e.item) e.item = d.item;
}
