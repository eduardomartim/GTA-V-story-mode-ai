import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { applyEsxDataset, DATASETS_DIR, loadEsxDataset, loadGtwDataset } from "./datasets";
import { AssetRecord, BacklogItem, CompletionRequirement, EntityRecord, SourceDef, type KnowledgeBase } from "./schema";

const KB_DIR = path.join(process.cwd(), "data", "kb");

/**
 * Reads and schema-validates the project's own knowledge base (data/kb), then the third-party datasets under
 * datasets/ (each optional, each under its own licence — see DATA_LICENSES.md). Dataset records are enriched copies
 * of the KB's own records or new records, so they replace originals by id. Throws a readable error on the first
 * invalid record.
 */
export function loadKnowledgeBase(dir = KB_DIR, datasetsDir = DATASETS_DIR): KnowledgeBase {
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as unknown;
  const sources = z.array(SourceDef).parse(read("sources.json"));
  const assets = fs.existsSync(path.join(dir, "assets.json")) ? z.array(AssetRecord).parse(read("assets.json")) : [];
  const backlog = fs.existsSync(path.join(dir, "backlog.json")) ? z.array(BacklogItem).parse(read("backlog.json")) : [];
  const ownCompletion = fs.existsSync(path.join(dir, "completion.json")) ? z.array(CompletionRequirement).parse(read("completion.json")) : [];

  const byId = new Map<string, EntityRecord>();
  const files = fs.readdirSync(dir).filter((f) => f.startsWith("entities-") && f.endsWith(".json")).sort();
  for (const file of files) {
    const parsed = z.array(EntityRecord).safeParse(read(file));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`Invalid KB file ${file} at ${issue?.path.join(".")}: ${issue?.message}`);
    }
    for (const e of parsed.data) {
      // Hand-curated files must not repeat an id.
      if (byId.has(e.id)) throw new Error(`Duplicate entity id ${e.id} in ${file}`);
      byId.set(e.id, e);
    }
  }

  const gtw = loadGtwDataset(datasetsDir);
  for (const e of applyEsxDataset(gtw.entities, loadEsxDataset(datasetsDir))) byId.set(e.id, e);
  return { sources, entities: [...byId.values()], assets, backlog, completion: [...ownCompletion, ...gtw.completion] };
}
