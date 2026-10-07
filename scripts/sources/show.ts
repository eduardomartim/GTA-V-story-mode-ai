/** CLI: prints the sectioned text of cached wiki pages (inspection aid while writing extractors). */
import { articleHtml, sections, toText } from "./html";
import { readCached } from "./http";

const max = Number(process.env.MAX ?? 4000);
for (const url of process.argv.slice(2)) {
  const c = readCached(url);
  console.log(`\n######## ${url}`);
  if (!c) { console.log("(not cached)"); continue; }
  let out = "";
  for (const s of sections(articleHtml(c.body))) out += `\n[h${s.level}] ${s.heading}\n${toText(s.html)}\n`;
  console.log(out.slice(0, max));
}
