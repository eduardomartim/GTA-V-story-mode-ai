/** CLI: prints raw cached HTML around a needle (inspection aid): tsx scripts/sources/raw.ts <url> <needle> [before] [after] */
import { readCached } from "./http";

const [url, needle, before = "400", after = "800"] = process.argv.slice(2);
const body = readCached(url as string)?.body ?? "";
const i = body.indexOf(needle as string);
console.log(i < 0 ? "(needle not found)" : body.slice(Math.max(0, i - Number(before)), i + Number(after)));
