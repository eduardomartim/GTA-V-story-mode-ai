/** CLI: prints the internal links of cached wiki pages (used to discover pages to fetch). */
import { articleHtml, wikiLinks } from "./html";
import { readCached } from "./http";

for (const url of process.argv.slice(2)) {
  const c = readCached(url);
  console.log(`== ${url}`);
  console.log(c ? wikiLinks(articleHtml(c.body)).join(" | ") : "(not cached)");
}
