/** CLI: tsx scripts/sources/fetch.ts <url> [url…]  |  tsx scripts/sources/fetch.ts --list urls.txt  (see http.ts for the rules). */
import fs from "node:fs";
import { politeFetch } from "./http";

const args = process.argv.slice(2);
const urls = args[0] === "--list"
  ? fs.readFileSync(args[1] as string, "utf8").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
  : args;
for (const url of urls) {
  try {
    const r = await politeFetch(url);
    console.log(`${r.blocked ? "BLOCKED" : r.status} ${url}`);
  } catch (err) {
    console.log(`SKIP ${url} — ${(err as Error).message}`);
  }
}
