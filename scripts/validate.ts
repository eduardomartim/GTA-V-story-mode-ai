import "./_boot";
import { loadKnowledgeBase } from "@/lib/kb/load";
import { checkLinks, validateKnowledgeBase } from "@/lib/kb/quality";

const kb = loadKnowledgeBase();
let issues = validateKnowledgeBase(kb);
if (process.argv.includes("--check-links")) issues = issues.concat(await checkLinks(kb));

for (const i of issues) console.log(`${i.level === "error" ? "ERROR  " : "warning"} ${i.entity ?? "-"}: ${i.message}`);
const errors = issues.filter((i) => i.level === "error").length;
console.log(`\n${kb.entities.length} entities, ${kb.sources.length} sources, ${kb.assets.length} assets, ${kb.backlog.length} backlog items — ${errors} errors, ${issues.length - errors} warnings`);
process.exit(errors ? 1 : 0);
