// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Eduardo Martim. This file is licensed under the GNU GPL v3 (datasets/esx-collectables/COPYING)
// because it generates the GPL-3.0 dataset datasets/esx-collectables/ (see that directory's NOTICE.md).
/**
 * Community-measured in-game coordinates from Mobius1/esx_collectables (GPL-3.0), config.lua.
 * The dataset gives positions only (no names or descriptions); its item numbers are the dataset's own ordering.
 * Output is consumed by the import pipeline, which attaches positions to item entities or creates
 * coordinate-only items for categories without a described list.
 */
import { readCached } from "../http";

export const ESX_URL = "https://raw.githubusercontent.com/Mobius1/esx_collectables/master/config.lua";
export const ESX_REPO = "https://github.com/Mobius1/esx_collectables";

export interface CoordPoint { n: number; x: number; y: number; z: number }
export interface CoordSet { key: string; title: string; category: string; points: CoordPoint[] }

const CATEGORY: Record<string, string> = {
  LetterScraps: "collectible:letter-scraps",
  SpaceshipParts: "collectible:spaceship-parts",
  HiddenPackages: "collectible:hidden-packages",
  NuclearWaste: "collectible:nuclear-waste",
  SubParts: "collectible:submarine-pieces",
  EpsilonTracts: "collectible:epsilon-tracts",
};

export function parseEsxConfig(lua: string): CoordSet[] {
  const out: CoordSet[] = [];
  const blocks = lua.split(/\n\s{4}(?=[A-Za-z]+\s*=\s*\{)/);
  for (const block of blocks) {
    const key = block.match(/^([A-Za-z]+)\s*=\s*\{/)?.[1];
    if (!key || !CATEGORY[key]) continue;
    const title = block.match(/Title\s*=\s*"([^"]+)"/)?.[1] ?? key;
    const points = [...block.matchAll(/ID\s*=\s*(\d+)\s*,\s*Pos\s*=\s*vector3\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g)].map((m) => ({
      n: Number(m[1]), x: Number(m[2]), y: Number(m[3]), z: Number(m[4]),
    }));
    out.push({ key, title, category: CATEGORY[key] as string, points });
  }
  return out;
}

export function esxCoordinates(): { sets: CoordSet[]; retrievedAt: string } | null {
  const c = readCached(ESX_URL);
  if (!c || c.status !== 200) return null;
  return { sets: parseEsxConfig(c.body), retrievedAt: c.fetchedAt.slice(0, 10) };
}
