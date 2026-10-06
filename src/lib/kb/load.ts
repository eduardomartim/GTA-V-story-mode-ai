import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { AssetRecord, BacklogItem, EntityRecord, SourceDef, type KnowledgeBase } from "./schema";

const KB_DIR = path.join(process.cwd(), "data", "kb");

/** Reads and schema-validates every JSON file under data/kb. Throws a readable error on the first invalid record. */
export function loadKnowledgeBase(dir = KB_DIR): KnowledgeBase {
  const read = (f: string) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as unknown;
  const sources = z.array(SourceDef).parse(read("sources.json"));
  const assets = fs.existsSync(path.join(dir, "assets.json")) ? z.array(AssetRecord).parse(read("assets.json")) : [];
  const backlog = fs.existsSync(path.join(dir, "backlog.json")) ? z.array(BacklogItem).parse(read("backlog.json")) : [];

  const entities: EntityRecord[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.startsWith("entities-") && f.endsWith(".json")).sort()) {
    const parsed = z.array(EntityRecord).safeParse(read(file));
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(`Invalid KB file ${file} at ${issue?.path.join(".")}: ${issue?.message}`);
    }
    entities.push(...parsed.data);
  }
  return { sources, entities, assets, backlog };
}
