/** Minimal, dependency-free HTML helpers for MediaWiki pages (Grand Theft Wiki). */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", ndash: "–", mdash: "—" };

export function decode(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e.startsWith("#x")) return String.fromCodePoint(parseInt(e.slice(2), 16));
    if (e.startsWith("#") && e !== "#39") return String.fromCodePoint(Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function toText(html: string): string {
  return decode(html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/ ([.,;:!?)])/g, "$1").replace(/\( /g, "(").trim();
}

/** The article body only (drops navigation, footer and the table of contents). */
export function articleHtml(page: string): string {
  const start = page.indexOf('id="mw-content-text"');
  let body = start >= 0 ? page.slice(start) : page;
  // Navigation boxes ("v · e" templates) sit at the end of the article; they are not article content.
  const end = body.search(/<div class="printfooter"|id="catlinks"|<table[^>]*class="[^"]*navbox|<div[^>]*class="[^"]*navbox/);
  if (end > 0) body = body.slice(0, end);
  return body.replace(/<div id="toc"[\s\S]*?<\/div>\s*<\/div>/, "").replace(/<div class="toc"[\s\S]*?<\/div>\s*<\/div>/, "").replace(/<span class="mw-editsection">[\s\S]*?<\/span>\s*<\/span>/g, "");
}

export interface Block { level: number; heading: string; html: string }

/** Splits an article into heading-delimited blocks (h2/h3/h4). */
export function sections(article: string): Block[] {
  const parts = article.split(/(<h[2-4][^>]*>[\s\S]*?<\/h[2-4]>)/i);
  const out: Block[] = [{ level: 1, heading: "", html: parts[0] ?? "" }];
  for (let i = 1; i < parts.length; i += 2) {
    const h = parts[i] as string;
    out.push({ level: Number(h.match(/<h([2-4])/i)?.[1] ?? 2), heading: toText(h), html: parts[i + 1] ?? "" });
  }
  return out;
}

/** Text of every <li>, WITHOUT the text of nested lists (each nested item is returned on its own). */
export function listItems(html: string): string[] {
  return html.split(/<li[^>]*>/i).slice(1).map((seg) => toText(seg.split(/<\/li>|<ul[\s>]|<ol[\s>]|<dl[\s>]/i)[0] as string)).filter(Boolean);
}

export function paragraphs(html: string): string[] {
  return [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => toText(m[1] as string)).filter(Boolean);
}

/** Rows of every wikitable as arrays of cell text (header row included). */
export function tables(html: string): string[][][] {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)].map((t) =>
    [...(t[1] as string).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...(r[1] as string).matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => toText(c[1] as string))),
  );
}

/** The lead (text before the first heading), without infobox/tables/maintenance notices. */
export function lead(article: string): string {
  const head = (article.split(/<div class="mw-heading|<h2/i)[0] ?? "").replace(/^id="mw-content-text"[^>]*>/, "");
  const cleaned = head
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(/<div[^>]*class="[^"]*(ambox|notice|thumb|hatnote)[^"]*"[\s\S]*?<\/div>/gi, " ")
    .replace(/<\/p>/gi, "</p>\n");
  const lines = toText(cleaned).split("\n").map((l) => l.trim()).filter((l) => l && !/^(This article|Spoiler Warning|For the )/i.test(l) && !/Error creating thumbnail/i.test(l));
  // The defining paragraph ("X is a …") first; narrative paragraphs that follow it are not part of the lead summary.
  return (lines.find((l) => / is (a|an|the) /.test(l)) ?? lines[0] ?? "").trim();
}

/** Every paragraph of the lead (before the first heading), cleaned — `lead()` returns only the defining one. */
export function leadBlock(article: string): string {
  const head = (article.split(/<div class="mw-heading|<h2/i)[0] ?? "").replace(/^id="mw-content-text"[^>]*>/, "");
  const cleaned = head
    .replace(/<table[\s\S]*?<\/table>/gi, " ")
    .replace(/<figure[\s\S]*?<\/figure>/gi, " ")
    .replace(/<div[^>]*class="[^"]*(ambox|notice|thumb|hatnote)[^"]*"[\s\S]*?<\/div>/gi, " ")
    .replace(/<\/p>/gi, "</p>\n");
  return toText(cleaned).split("\n").map((l) => l.trim()).filter((l) => l.length > 30 && !/^(This article|Spoiler Warning|For the )/i.test(l) && !/Error creating thumbnail/i.test(l)).join(" ");
}

export interface InfoField { text: string; links: string[] }

/** The first `class="infobox"` table as label → { text, linked page titles }. Empty when the page has none. */
export function infobox(page: string): { caption: string; fields: Record<string, InfoField> } {
  const table = page.match(/<table[^>]*class="infobox[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return { caption: "", fields: {} };
  const caption = toText(table.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)?.[1] ?? "");
  const fields: Record<string, InfoField> = {};
  for (const row of table.matchAll(/<tr[^>]*>\s*<th[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = toText(row[1] as string);
    const cell = (row[2] as string).replace(/<a [^>]*class="new"[^>]*title="Appearance::[^"]*"[^>]*>[\s\S]*?<\/a>/g, "");
    const links = [...cell.matchAll(/<a [^>]*title="([^"]+)"[^>]*>/g)].map((m) => decode(m[1] as string).replace(/ \(page does not exist\)$/, ""));
    fields[label] = { text: toText(cell.replace(/<br\s*\/?>/gi, " · ")), links };
  }
  return { caption, fields };
}

/** Internal wiki links in the article (page names). */
export function wikiLinks(article: string): string[] {
  return [...new Set([...article.matchAll(/<a href="\/([^"#?]+)"[^>]*title="[^"]+"/g)].map((m) => decodeURIComponent(m[1] as string)))]
    .filter((l) => !/^(Special|File|Help|Template|User|Grand_Theft_Wiki|Talk|Category_talk)[:_]/.test(l));
}
