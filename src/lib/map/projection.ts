/**
 * Project-owned map coordinate system.
 *
 * Game coordinates (x east, y north, in-game metres) are projected onto a normalised 0..1 square
 * (map_x → right, map_y → down) that matches the project's own schematic SVG map
 * (`/public/maps/san-andreas.svg`, viewBox 0 0 720 1000). The bounds are an approximation of the
 * playable area; coordinates stored in the KB are flagged `approximate` and are NEVER presented as
 * exact. The schematic map is original artwork — it is not extracted from the game.
 */
export const MAP_BOUNDS = { minX: -4200, maxX: 4600, minY: -4000, maxY: 8200 } as const;
export const MAP_VIEWBOX = { width: 720, height: 1000 } as const;

export function gameToMap(x: number, y: number): { x: number; y: number } {
  const { minX, maxX, minY, maxY } = MAP_BOUNDS;
  const nx = (x - minX) / (maxX - minX);
  const ny = 1 - (y - minY) / (maxY - minY);
  return { x: Math.min(1, Math.max(0, nx)), y: Math.min(1, Math.max(0, ny)) };
}

export function mapToViewBox(p: { x: number; y: number }): { x: number; y: number } {
  return { x: p.x * MAP_VIEWBOX.width, y: p.y * MAP_VIEWBOX.height };
}

/** Public interactive map referenced by the product brief (links only; no content is copied). */
export const EXTERNAL_MAP_URL =
  "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More";
