/**
 * Stage 2 — Extraction: cached source pages → normalized drafts in datasets/grandtheftwiki/extracted/<name>.json (committed, attributed, CC BY-SA 3.0).
 * Usage: tsx scripts/sources/extract.ts [name…]   (default: all extractors)
 */
import fs from "node:fs";
import path from "node:path";
import type { ExtractResult } from "./extract/common";
import { extractCollectibles } from "./extract/collectibles";
import { extractCompletion } from "./extract/completion";
import { extractRandomEvents } from "./extract/random-events";
import { extractMissions } from "./extract/missions";
import { extractCharacters } from "./extract/characters";
import { extractEasterEggs } from "./extract/easter-eggs";
import { extractPages } from "./extract/pages";
import { extractVehicles } from "./extract/vehicles";
import { extractTables } from "./extract/tables";

const EXTRACTORS: Record<string, () => ExtractResult> = {
  collectibles: extractCollectibles,
  completion: extractCompletion,
  "random-events": extractRandomEvents,
  missions: extractMissions,
  characters: extractCharacters,
  "easter-eggs": extractEasterEggs,
  pages: extractPages,
  vehicles: extractVehicles,
  tables: extractTables,
};

const OUT = path.join(process.cwd(), "datasets", "grandtheftwiki", "extracted");
fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
for (const [name, fn] of Object.entries(EXTRACTORS)) {
  if (wanted.length && !wanted.includes(name)) continue;
  const res = fn();
  fs.writeFileSync(path.join(OUT, `${name}.json`), `${JSON.stringify({ extractor: name, entities: res.entities, completion: (res as { completionDrafts?: unknown[] }).completionDrafts ?? res.completion ?? [], issues: res.issues }, null, 1)}\n`);
  console.log(`${name}: ${res.entities.length} entities, ${((res as { completionDrafts?: unknown[] }).completionDrafts ?? res.completion ?? []).length} completion rows, ${res.issues.length} issues`);
  for (const i of res.issues) console.log(`  ! ${i}`);
}
