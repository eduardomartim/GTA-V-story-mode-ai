import fs from "node:fs";
import path from "node:path";

export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
export type Status = "verified" | "curated" | "unverified";

export interface Ent {
  id: string;
  type: string;
  name: string;
  aliases?: string[];
  summary: string;
  story_mode?: boolean;
  online_only?: boolean;
  spoiler_level?: number;
  versions?: string[];
  verification?: Status;
  confidence?: number;
  sources: { source: string; url: string; confidence?: number; retrieved_at?: string }[];
  attrs?: Record<string, Json>;
  sections?: { kind: string; title: string; text: string; status?: Status; versions?: string[]; src?: number }[];
  relations?: { predicate: string; to: string }[];
  location?: { region?: string; district?: string; game_x?: number; game_y?: number; game_z?: number; coord_precision?: string; external_map_url?: string };
}

export const R = "2026-10-06"; // retrieval date of every fetched source below
export const gtw = (page: string, c = 0.8) => ({ source: "grandtheftwiki", url: `https://www.grandtheftwiki.com/${page}`, confidence: c, retrieved_at: R });
export const gp = (p: string, c = 0.7) => ({ source: "gamepressure", url: `https://www.gamepressure.com/gtav/${p}`, confidence: c, retrieved_at: R });
export const gb = (url: string, c = 0.7) => ({ source: "gtabase", url, confidence: c, retrieved_at: R });
export const gi = (url: string, c = 0.55) => ({ source: "gtaintel", url, confidence: c, retrieved_at: R });
export const ds = (url: string, c = 0.6) => ({ source: "destructoid", url, confidence: c, retrieved_at: R });
export const gw = (page: string, c = 0.7) => ({ source: "gta-wiki", url: `https://gta.fandom.com/wiki/${page}`, confidence: c });
export const rs = (url: string, source: "rockstar" | "rockstar-support" = "rockstar", c = 0.8) => ({ source, url, confidence: c });
export const IGN_MAP = "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More";

export const GB_100 = "https://www.gtabase.com/grand-theft-auto-v/guides/gta-5-100-completion-guide-checklist";
export const GB_STOCK = "https://gtabase.com/grand-theft-auto-v/side-missions/gta-5-lester-s-assassinations-guide-how-to-make-2-billion-with-stock-market";

const OUT = path.join(process.cwd(), "data", "kb");
export function write(name: string, data: unknown): void {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${(data as unknown[]).length} → data/kb/${name}`);
}
export const GB_BIG = "https://gtabase.com/grand-theft-auto-v/missions/planning-the-big-score";
export const g5w = (p: string, c = 0.6) => ({ source: "gta5wiki", url: `https://gta5wiki.com/${p}`, confidence: c, retrieved_at: R });
