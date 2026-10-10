import { normalize } from "@/lib/text";
import { INTENT_ENTITY_TYPES } from "./retrieval";
import type { Candidate, Intent, Lang } from "./types";
import { t } from "./messages";

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const TYPE_LABEL: Record<string, string> = { mission: "mission", heist: "heist", character: "character", location: "location", collectible: "collectible", vehicle: "vehicle", cheat: "cheat", ending: "ending" };

/** Turns a chunk into readable bullets: summary line first, remaining "key: value" facts as a compact tail. */
function prettify(c: Candidate): string {
  // Only the generated entity overview has the "[type] — scope" header line; titled sections are plain text.
  if (c.contentType !== "overview" || !/^[^\n]* \[[a-z_ ]+\] — /.test(c.content)) return c.content.replace(/^[^:\n]+ — [^:\n]+: /, "");
  const lines = c.content.split("\n").slice(1); // drop the "[type] — scope" header line
  const summary = lines[0] ?? "";
  const facts = lines
    .slice(1)
    .filter((l) => !/^Also known as:/.test(l) && !/^Versions:/.test(l) && l.length > 0)
    .map((l) => l.replace(/^Location: /, "📍 "))
    .join(" · ");
  return facts ? `${summary}\n  - _${clip(facts, 280)}_` : summary;
}

/**
 * DEMO MODE composer — used ONLY when no AI provider is configured. It assembles an answer straight
 * from the retrieved chunks (no language model) and says so in a banner. It is a development fallback,
 * not a replacement for the real path: User → retrieval → AI provider → grounded answer.
 */
export function composeDemoAnswer(context: Candidate[], lang: Lang, gaps: string[] = [], intents: Intent[] = []): string {
  const lines: string[] = [t("demoBanner", lang), ""];
  if (gaps.length) lines.push(`ℹ️ ${t("notValidated", lang)} (${t("backlogPrefix", lang)}: ${gaps.join(", ")}.)`, "");
  const groups = new Map<string, { title: string; type: string; best: number; first: number; items: Array<{ c: Candidate; label: number }> }>();
  context.forEach((c, i) => {
    const g = groups.get(c.entityId) ?? { title: `${c.entityName}${TYPE_LABEL[c.entityType] ? ` · ${TYPE_LABEL[c.entityType]}` : ""}`, type: c.entityType, best: 0, first: i, items: [] };
    g.items.push({ c, label: i + 1 });
    g.best = Math.max(g.best, c.score);
    groups.set(c.entityId, g);
  });
  // The kind of thing the question asks about leads ("fantasma do Mount Gordo" → the ghost before the mountain); weak
  // groups (far below the best one) are left out instead of padding the answer.
  const wanted = new Set<string>(intents.flatMap((i) => INTENT_ENTITY_TYPES[i] ?? []));
  const top = Math.max(...[...groups.values()].map((g) => g.best), 0);
  const ordered = [...groups.values()]
    .filter((g, i) => i === 0 || g.best >= top * 0.45 || wanted.has(g.type))
    .sort((a, b) => Number(wanted.has(b.type)) - Number(wanted.has(a.type)) || a.first - b.first);
  // Two sources often carry the same sentence: say it once.
  const seen = new Set<string>();
  for (const group of ordered.slice(0, 4)) {
    const items = group.items.filter(({ c }) => {
      const key = normalize(prettify(c)).slice(0, 160);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!items.length) continue;
    lines.push(`### ${group.title}`);
    for (const { c, label } of items.slice(0, 4)) lines.push(`- ${c.verification === "unverified" ? "⚠️ _unverified_ — " : ""}${clip(prettify(c), c.contentType === "list" ? 1600 : 520)} [S${label}]`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
