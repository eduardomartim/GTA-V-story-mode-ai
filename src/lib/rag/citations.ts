import type { Candidate, SourceCardData } from "./types";

export interface ResolvedCitations {
  text: string;
  sources: SourceCardData[];
  cited: boolean;
}

function toCard(c: Candidate, index: number): SourceCardData {
  return {
    index, title: c.entityName, sourceName: c.sourceName, sourceType: c.sourceType, url: c.sourceUrl,
    confidence: c.confidence, verification: c.verification, entityId: c.entityId,
  };
}

/**
 * Validates the model's [S#] markers against the context actually supplied, drops invented ones,
 * merges blocks that share a source URL, and renumbers in order of first appearance. Markers become
 * Markdown anchor links ([1](#source-1)) which the UI renders as clickable citation chips.
 * If the model cited nothing valid, the top sources are attached anyway (attribution is never empty).
 */
export function resolveCitations(answer: string, context: Candidate[]): ResolvedCitations {
  const display = new Map<string, number>(); // source url → display number
  const sources: SourceCardData[] = [];

  const WORSE: Record<string, number> = { verified: 0, curated: 1, unverified: 2 };
  const numberFor = (c: Candidate): number => {
    const existing = display.get(c.sourceUrl);
    if (existing) {
      // A source card must never look more trustworthy than the least-trusted block it backs.
      const card = sources[existing - 1];
      if (card && (WORSE[c.verification] ?? 1) > (WORSE[card.verification] ?? 1)) card.verification = c.verification;
      return existing;
    }
    const idx = sources.length + 1;
    display.set(c.sourceUrl, idx);
    sources.push(toCard(c, idx));
    return idx;
  };

  let cited = false;
  const text = answer
    .replace(/\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g, (_m, group: string) => {
      const nums = [...group.matchAll(/S(\d+)/g)].map((m) => Number(m[1]));
      const links: string[] = [];
      for (const n of nums) {
        const c = context[n - 1];
        if (!c) continue; // invented label → removed
        cited = true;
        const d = numberFor(c);
        const link = `[${d}](#source-${d})`;
        if (!links.includes(link)) links.push(link);
      }
      return links.join("");
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\s{2,}\n/g, "\n");

  if (!cited) for (const c of context.slice(0, 3)) numberFor(c);
  return { text, sources, cited };
}
