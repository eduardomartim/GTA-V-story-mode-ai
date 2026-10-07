// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Eduardo Martim. This file is licensed under the GNU GPL v3 (datasets/esx-collectables/COPYING)
// because it generates the GPL-3.0 dataset datasets/esx-collectables/land.json (see that directory's NOTICE.md).
/**
 * Derives the schematic coastline of the project's base map FROM DATA (no game artwork is used):
 *   land samples  = community-measured coordinates above water (z ≥ 0) + area reference points + KB location points
 *   water samples = community-measured coordinates under water (z < 0)
 * A coarse raster is marked as land within a radius of land samples (but never over a water sample), the boundary is
 * traced with marching squares and simplified. Because it is derived from the esx_collectables coordinates (GPL-3.0),
 * the result is part of that dataset: datasets/esx-collectables/land.json (GPL-3.0, see its NOTICE.md). It is served
 * at runtime by /api/map and is not imported by client code. Re-run after adding coordinate data: `npm run kb:land`.
 */
import fs from "node:fs";
import path from "node:path";
import { esxCoordinates } from "../sources/extract/coords-esx";
import { MAP_BOUNDS } from "../../src/lib/map/projection";

type P = [number, number];
const CELL = 150;
const LAND_R = 720;
const WATER_R = 260;

const esx = esxCoordinates();
if (!esx) throw new Error("esx_collectables config.lua not cached — fetch it first (see scripts/sources/fetch.ts)");
const gaz = (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "gazetteer.json"), "utf8")) as { areas: Array<{ x: number; y: number }> }).areas;

const land: P[] = [];
const water: P[] = [];
for (const s of esx.sets) for (const p of s.points) (p.z >= 0 ? land : water).push([p.x, p.y]);
for (const a of gaz) land.push([a.x, a.y]);
const kbDir = path.join(process.cwd(), "data", "kb");
for (const f of fs.readdirSync(kbDir).filter((x) => x.startsWith("entities-") && x.endsWith(".json"))) {
  for (const e of JSON.parse(fs.readFileSync(path.join(kbDir, f), "utf8")) as Array<{ type: string; location?: { game_x?: number; game_y?: number } }>) {
    if (e.type === "location" && e.location?.game_x !== undefined && e.location.game_y !== undefined) land.push([e.location.game_x, e.location.game_y]);
  }
}

const { minX, maxX, minY, maxY } = MAP_BOUNDS;
const W = Math.ceil((maxX - minX) / CELL);
const H = Math.ceil((maxY - minY) / CELL);
const grid: boolean[][] = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
const cx = (i: number) => minX + (i + 0.5) * CELL;
const cy = (j: number) => minY + (j + 0.5) * CELL;
for (let j = 0; j < H; j++) {
  for (let i = 0; i < W; i++) {
    const x = cx(i);
    const y = cy(j);
    const nearLand = land.some(([lx, ly]) => (lx - x) ** 2 + (ly - y) ** 2 < LAND_R ** 2);
    const nearWater = water.some(([wx, wy]) => (wx - x) ** 2 + (wy - y) ** 2 < WATER_R ** 2);
    (grid[j] as boolean[])[i] = nearLand && !nearWater;
  }
}
// Close small holes (inland gaps between samples): a cell surrounded by land on ≥ 6 of 8 sides becomes land.
for (let pass = 0; pass < 4; pass++) {
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    if (grid[j]?.[i]) continue;
    let n = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && grid[j + dj]?.[i + di]) n++;
    if (n >= 6) (grid[j] as boolean[])[i] = true;
  }
}

// Marching squares → boundary segments → chained polygons.
const at = (i: number, j: number) => (i >= 0 && j >= 0 && i < W && j < H ? grid[j]?.[i] === true : false);
const segs: Array<[P, P]> = [];
for (let j = -1; j < H; j++) {
  for (let i = -1; i < W; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    const code = (a ? 8 : 0) | (b ? 4 : 0) | (c ? 2 : 0) | (d ? 1 : 0);
    if (code === 0 || code === 15) continue;
    const x0 = cx(i), y0 = cy(j), x1 = cx(i + 1), y1 = cy(j + 1);
    const top: P = [(x0 + x1) / 2, y0], right: P = [x1, (y0 + y1) / 2], bottom: P = [(x0 + x1) / 2, y1], left: P = [x0, (y0 + y1) / 2];
    const table: Record<number, Array<[P, P]>> = {
      1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]], 5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]],
      8: [[top, left]], 9: [[top, bottom]], 10: [[top, right], [left, bottom]], 11: [[top, right]], 12: [[left, right]], 13: [[bottom, right]], 14: [[left, bottom]],
    };
    for (const s of table[code] ?? []) segs.push(s);
  }
}
const key = (p: P) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
const adj = new Map<string, P[]>();
for (const [p, q] of segs) {
  adj.set(key(p), [...(adj.get(key(p)) ?? []), q]);
  adj.set(key(q), [...(adj.get(key(q)) ?? []), p]);
}
const used = new Set<string>();
const polys: P[][] = [];
for (const [p] of segs) {
  if (used.has(key(p))) continue;
  const poly: P[] = [p];
  used.add(key(p));
  let cur = p;
  for (;;) {
    const next = (adj.get(key(cur)) ?? []).find((n) => !used.has(key(n)));
    if (!next) break;
    used.add(key(next));
    poly.push(next);
    cur = next;
  }
  if (poly.length > 12) polys.push(poly);
}

// Douglas–Peucker simplification + light Chaikin smoothing.
function simplify(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0] as P, pts[pts.length - 1] as P];
  let idx = 0, dmax = 0;
  for (let k = 1; k < pts.length - 1; k++) {
    const p = pts[k] as P;
    const num = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]);
    const d = num / (Math.hypot(b[1] - a[1], b[0] - a[0]) || 1);
    if (d > dmax) { dmax = d; idx = k; }
  }
  if (dmax <= eps) return [a, b];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}
function chaikin(pts: P[]): P[] {
  const out: P[] = [];
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k] as P, q = pts[(k + 1) % pts.length] as P;
    out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  return out;
}
const area = (pts: P[]) => Math.abs(pts.reduce((s, p, k) => { const q = pts[(k + 1) % pts.length] as P; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
const shapes = polys.map((p) => chaikin(chaikin(simplify(p, 90)))).filter((p) => area(p) > 400_000).sort((a, b) => area(b) - area(a));
const out = shapes.map((p) => p.map(([x, y]) => [Math.round(x), Math.round(y)]));
// GPL-3.0: traced from the esx_collectables coordinates, so it belongs to that dataset and never enters the client bundle.
fs.writeFileSync(path.join(process.cwd(), "datasets", "esx-collectables", "land.json"), `${JSON.stringify({ note: "Derived from data by scripts/dev/build-land.ts — not game artwork.", shapes: out })}\n`);
console.log(`land shapes: ${out.length} (points: ${out.map((s) => s.length).join(", ")}) from ${land.length} land / ${water.length} water samples`);
