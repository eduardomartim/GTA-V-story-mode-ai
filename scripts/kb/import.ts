/**
 * CLI for the ingestion pipeline (see pipeline.ts). Usage: npm run kb:import
 * Reads the extracted drafts (datasets/grandtheftwiki/extracted/*.json), the project gazetteer (data/gazetteer.json) and
 * the cached esx_collectables coordinates, then writes the result split BY LICENCE (see src/lib/kb/datasets.ts):
 *   datasets/grandtheftwiki/entities.json, completion.json, import-report.json   (CC BY-SA 3.0)
 *   datasets/esx-collectables/coordinates.json                                    (GPL-3.0)
 * and runs the KB quality rules on the combined result. Exit code 1 on any validation error.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { DATASETS_DIR, ESX_DIR, GTW_DIR, splitByLicence } from "../../src/lib/kb/datasets";
import { EntityRecord, SourceDef, type KnowledgeBase } from "../../src/lib/kb/schema";
import { validateKnowledgeBase } from "../../src/lib/kb/quality";
import type { EntityDraft } from "../sources/extract/common";
import type { CompletionDraft } from "../sources/extract/completion";
import { ESX_REPO, esxCoordinates } from "../sources/extract/coords-esx";
import { runPipeline, type GazetteerArea } from "./pipeline";

const KB = path.join(process.cwd(), "data", "kb");
const GTW = path.join(DATASETS_DIR, GTW_DIR);
const ESX = path.join(DATASETS_DIR, ESX_DIR);
const INGEST = path.join(GTW, "extracted");

const read = (f: string) => JSON.parse(fs.readFileSync(f, "utf8")) as unknown;

const base = fs.readdirSync(KB).filter((f) => f.startsWith("entities-") && f.endsWith(".json")).sort()
  .flatMap((f) => z.array(EntityRecord).parse(read(path.join(KB, f))));

const drafts: EntityDraft[] = [];
const completion: CompletionDraft[] = [];
for (const f of fs.readdirSync(INGEST).filter((x) => x.endsWith(".json")).sort()) {
  const doc = read(path.join(INGEST, f)) as { entities?: EntityDraft[]; completion?: CompletionDraft[] };
  drafts.push(...(doc.entities ?? []));
  completion.push(...(doc.completion ?? []));
}
const gazetteer = (read(path.join(process.cwd(), "data", "gazetteer.json")) as { areas: GazetteerArea[] }).areas;
const esx = esxCoordinates();
const onlineTerms = base.filter((e) => e.online_only).flatMap((e) => [e.name, ...e.aliases]);

const { entities, completion: reqs, report } = runPipeline({
  base, drafts, completion, gazetteer, onlineTerms,
  coords: esx ? { ...esx, repoUrl: `${ESX_REPO}/blob/master/config.lua` } : undefined,
});
if (!esx) report.warnings.push("esx_collectables config.lua not cached — run: npm run sources:fetch -- https://raw.githubusercontent.com/Mobius1/esx_collectables/master/config.lua");

// Base entities that were enriched are written back into the generated file too (merged copy wins at load time).
const baseIds = new Set(base.map((e) => e.id));
const changed = entities.filter((e) => !baseIds.has(e.id) || JSON.stringify(e) !== JSON.stringify(base.find((b) => b.id === e.id)));
// One file per licence: no file mixes CC BY-SA 3.0 and GPL-3.0 material.
const split = splitByLicence(changed);
fs.mkdirSync(ESX, { recursive: true });
fs.writeFileSync(path.join(GTW, "entities.json"), `${JSON.stringify(split.gtw, null, 1)}\n`);
fs.writeFileSync(path.join(GTW, "completion.json"), `${JSON.stringify(reqs, null, 1)}\n`);
fs.writeFileSync(path.join(ESX, "coordinates.json"), `${JSON.stringify(split.esx, null, 1)}\n`);

const sources = z.array(SourceDef).parse(read(path.join(KB, "sources.json")));
const kb: KnowledgeBase = { sources, entities, assets: [], backlog: [], completion: reqs };
const issues = validateKnowledgeBase(kb);
const errors = issues.filter((i) => i.level === "error");
fs.writeFileSync(path.join(GTW, "import-report.json"), `${JSON.stringify({ ...report, validation: { errors: errors.length, warnings: issues.length - errors.length, first: errors.slice(0, 20) } }, null, 1)}\n`);

console.log(`entities total ${entities.length} · written ${changed.length} (new + enriched: ${split.gtw.length} CC BY-SA, ${split.esx.entities.length} GPL + ${split.esx.attachments.length} GPL coordinate attachments) · completion rows ${reqs.length}`);
console.log(JSON.stringify(report.counts));
for (const c of report.coordinateLinks) console.log(`coords ${c.category}: linked ${c.linked}, unlinked ${c.unlinked}, created ${c.created}${c.meanResidual !== undefined ? `, mean residual ${c.meanResidual} m, area agrees ${c.agreeingArea}/${c.linked}` : ""}`);
if (report.conflicts.length) console.log(`conflicts recorded: ${report.conflicts.length}`);
if (report.unresolved.length) console.log(`unresolved relation targets: ${report.unresolved.length} (see datasets/grandtheftwiki/import-report.json)`);
if (report.rejected.length) console.log(`rejected: ${report.rejected.length} (see report)`);
console.log(`validation: ${errors.length} errors, ${issues.length - errors.length} warnings`);
for (const e of errors.slice(0, 10)) console.log(`  ✗ ${e.entity ?? ""} ${e.message}`);
if (errors.length) process.exit(1);
