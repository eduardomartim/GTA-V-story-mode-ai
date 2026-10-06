import fs from "node:fs";
import path from "node:path";
import { mapSvgMarkup } from "@/lib/map/svg";

const dir = path.join(process.cwd(), "public", "maps");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "san-andreas.svg"), mapSvgMarkup([], { standalone: true }));
console.log("wrote public/maps/san-andreas.svg");
