import type { Candidate, Lang } from "./types";
import { t } from "./messages";

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`);
const TYPE_LABEL: Record<string, string> = { mission: "mission", heist: "heist", character: "character", location: "location", collectible: "collectible", vehicle: "vehicle", cheat: "cheat", ending: "ending" };

/** Turns a chunk into readable bullets: summary line first, remaining "key: value" facts as a compact tail. */
function prettify(c: Candidate): string {
  if (c.contentType !== "overview") return c.content.replace(/^[^:\n]+ — [^:\n]+: /, "");
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
export function composeDemoAnswer(context: Candidate[], lang: Lang, gaps: string[] = []): string {
  const lines: string[] = [t("demoBanner", lang), ""];
  if (gaps.length) lines.push(`ℹ️ ${t("notValidated", lang)} (${t("backlogPrefix", lang)}: ${gaps.join(", ")}.)`, "");
  const groups = new Map<string, { title: string; items: Array<{ c: Candidate; label: number }> }>();
  context.forEach((c, i) => {
    const g = groups.get(c.entityId) ?? { title: `${c.entityName}${TYPE_LABEL[c.entityType] ? ` · ${TYPE_LABEL[c.entityType]}` : ""}`, items: [] };
    g.items.push({ c, label: i + 1 });
    groups.set(c.entityId, g);
  });
  for (const group of [...groups.values()].slice(0, 3)) {
    lines.push(`### ${group.title}`);
    for (const { c, label } of group.items.slice(0, 3)) lines.push(`- ${c.verification === "unverified" ? "⚠️ _unverified_ — " : ""}${clip(prettify(c), c.contentType === "list" ? 1600 : 520)} [S${label}]`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
