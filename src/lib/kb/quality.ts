import type { KnowledgeBase } from "./schema";
import { MAP_BOUNDS } from "@/lib/map/projection";
import { AVAILABILITY } from "./schema";

export interface QualityIssue {
  level: "error" | "warning";
  entity?: string;
  message: string;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Offline data-quality rules. `npm run kb:validate` fails the build on any "error". */
export function validateKnowledgeBase(kb: KnowledgeBase): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const err = (message: string, entity?: string) => issues.push({ level: "error", entity, message });
  const warn = (message: string, entity?: string) => issues.push({ level: "warning", entity, message });

  const sources = new Map(kb.sources.map((s) => [s.id, s]));
  if (sources.size !== kb.sources.length) err("Duplicate source ids");

  const ids = new Set<string>();
  for (const e of kb.entities) {
    if (ids.has(e.id)) err("Duplicate entity_id", e.id);
    ids.add(e.id);
  }
  const aliasOwners = new Map<string, string>();

  for (const e of kb.entities) {
    const prefix = e.id.split(":")[0];
    if (prefix !== e.type) err(`id prefix "${prefix}" does not match type "${e.type}"`, e.id);

    // Every entity needs at least one valid, host-consistent source.
    for (const ref of e.sources) {
      const def = sources.get(ref.source);
      if (!def) {
        err(`Unknown source "${ref.source}"`, e.id);
        continue;
      }
      const host = hostOf(ref.url);
      const base = hostOf(def.base_url);
      if (!host || !ref.url.startsWith("https://")) err(`Source URL is not a valid https URL: ${ref.url}`, e.id);
      else if (base && host !== base && !host.endsWith(`.${base}`)) err(`Source URL host ${host} does not belong to source ${def.id} (${base})`, e.id);
    }

    // Verified claims must be traceable to a retrieval date.
    const claimsVerified = e.verification === "verified" || e.sections.some((s) => s.status === "verified");
    if (claimsVerified && !e.sources.some((s) => s.retrieved_at)) err("Verified knowledge requires a source with retrieved_at", e.id);

    // Vehicles/weapons must declare availability; the enum must agree with the Online flags.
    if (e.type === "vehicle" || e.type === "weapon") {
      const av = e.attrs.availability;
      if (typeof av !== "string" || !(AVAILABILITY as readonly string[]).includes(av)) err(`${e.type} needs attrs.availability in ${AVAILABILITY.join("|")}`, e.id);
      else if (av === "ONLINE_ONLY" && !e.online_only) err("ONLINE_ONLY items must be online_only entities", e.id);
      else if (av !== "ONLINE_ONLY" && e.online_only) err("online_only entity must declare availability ONLINE_ONLY", e.id);
    }

    // Story Mode / Online separation.
    if (e.story_mode && e.online_only) err("Entity cannot be story_mode and online_only", e.id);
    if (e.type === "online_boundary" && !e.online_only) err("online_boundary entities must be online_only", e.id);
    if (e.type !== "online_boundary" && e.online_only) err("Only online_boundary entities may be online_only", e.id);
    if (e.type === "mission" && !e.story_mode) err("Missions must be Story Mode", e.id);
    if (e.type === "vehicle" && e.attrs.story_mode_available === false && e.story_mode) err("Vehicle unavailable in Story Mode cannot be tagged story_mode", e.id);
    if (e.type === "ending" && e.spoiler_level < 2) warn("Endings should have spoiler_level >= 2", e.id);

    // Locations.
    if (e.type === "location") {
      const l = e.location;
      if (!l) warn("Location without a location block", e.id);
      else if (l.game_x !== undefined && l.game_y !== undefined) {
        const { minX, maxX, minY, maxY } = MAP_BOUNDS;
        if (l.game_x < minX || l.game_x > maxX || l.game_y < minY || l.game_y > maxY) err("Coordinates outside map bounds", e.id);
        if (l.coord_precision === "verified" && e.verification !== "verified") err("Verified coordinates require a verified entity", e.id);
      }
    }

    // Aliases must not be shared between different entities.
    for (const a of [e.name, ...e.aliases]) {
      const key = a.toLowerCase();
      const owner = aliasOwners.get(key);
      if (owner && owner !== e.id && !(e.type === "mission" || owner.startsWith("mission:")) && owner.split(":")[1] !== e.id.split(":")[1]) warn(`Alias "${a}" is also used by ${owner}`, e.id);
      else aliasOwners.set(key, e.id);
    }
  }

  // Referential integrity of the light knowledge graph.
  for (const e of kb.entities) {
    for (const r of e.relations) if (!ids.has(r.to)) err(`Relation ${r.predicate} → unknown entity ${r.to}`, e.id);
  }
  for (const a of kb.assets) if (a.entity_id && !ids.has(a.entity_id)) err(`Asset ${a.id} references unknown entity ${a.entity_id}`);
  for (const a of kb.assets) if (a.url.startsWith("http") && !a.url.startsWith("https://")) err(`Asset ${a.id} is not https`);
  for (const b of kb.backlog) if (b.entity_id && !ids.has(b.entity_id)) warn(`Backlog references unknown entity ${b.entity_id}`);

  return issues;
}

/** Optional network check. Hosts behind bot protection (Cloudflare, paywalled fetchers) are reported as "unknown", not broken. */
export async function checkLinks(kb: KnowledgeBase, limit = 40): Promise<QualityIssue[]> {
  const urls = new Map<string, string>();
  for (const e of kb.entities) for (const s of e.sources) if (!urls.has(s.url)) urls.set(s.url, e.id);
  const issues: QualityIssue[] = [];
  for (const [url, entity] of [...urls].slice(0, limit)) {
    try {
      const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (res.status === 404 || res.status === 410) issues.push({ level: "error", entity, message: `Broken link (${res.status}): ${url}` });
      else if (res.status >= 400) issues.push({ level: "warning", entity, message: `Link not verifiable (${res.status}): ${url}` });
    } catch {
      issues.push({ level: "warning", entity, message: `Link unreachable: ${url}` });
    }
  }
  return issues;
}
