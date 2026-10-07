/**
 * The GTA V vehicle list (Grand Theft Wiki "Vehicles in GTA V": class · make · model · number of variants).
 * The list is the launch-game roster (it contains no GTA Online DLC vehicles), so availability is STORY_MODE (curated,
 * single source). Spawn locations are NOT on the source pages for GTA V and are therefore not invented.
 */
import { articleHtml, tables } from "../html";
import { gtwRef, idFor, page, type EntityDraft, type ExtractResult } from "./common";

export function extractVehicles(): ExtractResult {
  const p = page("Vehicles_in_GTA_V");
  if (!p) return { name: "vehicles", entities: [], issues: ["Vehicles_in_GTA_V not cached"] };
  const rows = tables(articleHtml(p.html)).flat().filter((r) => r.length >= 3 && r[0] !== "Class");
  const entities: EntityDraft[] = [];
  const seen = new Set<string>();
  for (const [cls, make, model, variants] of rows) {
    if (!model || seen.has(model)) continue;
    seen.add(model);
    entities.push({
      id: idFor("vehicle", model), type: "vehicle", name: model,
      summary: `${model}${make ? ` by ${make}` : ""} — ${cls} class vehicle in Grand Theft Auto V (listed on the GTA V vehicle roster${variants && variants !== "1" ? `, ${variants} variants` : ""}).`,
      verification: "curated", confidence: 0.7,
      sources: [gtwRef(p, `${cls} · ${make || "—"} · ${model} · variants: ${variants ?? "?"}`)],
      attrs: { ...(make ? { manufacturer: make } : {}), vehicle_class: cls, variants: Number(variants) || undefined, availability: "STORY_MODE", spawn_locations: "not validated yet (not on the source page)" },
    });
  }
  return { name: "vehicles", entities, issues: [`${entities.length} vehicles from the GTA V roster`] };
}
