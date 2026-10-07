import { MAP_VIEWBOX, gameToMap } from "./projection";

/**
 * Original, schematic drawing of San Andreas by the project author (NOT extracted from the game and NOT derived from
 * third-party data): a hand-placed outline, lake, mountain and city block, deliberately simplified. One generator
 * feeds both the React MapCard and the static /public/maps/san-andreas.svg file, so they can never drift apart.
 *
 * The more detailed coastline traced from the esx_collectables coordinates is a GPL-3.0 dataset
 * (datasets/esx-collectables/land.json). It is NOT imported here, so it never enters the client bundle; the
 * interactive map receives it at runtime from /api/map, with its licence notice.
 */
type Pt = [number, number];

const LAND: Pt[] = [
  [-3500, -3400], [-500, -3550], [2000, -3550], [3800, -3000], [4300, -1500], [4300, 2000], [3900, 4000], [3700, 5500], [3000, 6600],
  [1000, 7100], [-1000, 7600], [-2200, 7000], [-3000, 5500], [-3500, 3500], [-3600, 1000], [-3300, -500], [-2800, -1800], [-3000, -2700],
];
const LOS_SANTOS: Pt[] = [[-2000, -2800], [1500, -2800], [1500, 1200], [-2000, 1200]];
const ALAMO: Pt[] = [[900, 3700], [1500, 3500], [2150, 3750], [2100, 4500], [1500, 4800], [900, 4400]];
const CHILIAD: Pt[] = [[250, 5350], [450, 5900], [700, 5350]];

const px = (p: Pt) => {
  const m = gameToMap(p[0], p[1]);
  return `${(m.x * MAP_VIEWBOX.width).toFixed(1)},${(m.y * MAP_VIEWBOX.height).toFixed(1)}`;
};
const poly = (pts: Pt[]) => pts.map(px).join(" ");

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export interface MapMarker {
  name: string;
  mapX: number;
  mapY: number;
  primary?: boolean;
}

export function mapSvgMarkup(markers: MapMarker[] = [], opts: { standalone?: boolean; label?: string; viewBox?: string } = {}): string {
  const { width: W, height: H } = MAP_VIEWBOX;
  const grid: string[] = [];
  for (let gx = -4000; gx <= 4000; gx += 1000) {
    const x = gameToMap(gx, 0).x * W;
    grid.push(`<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" />`);
  }
  for (let gy = -3000; gy <= 8000; gy += 1000) {
    const y = gameToMap(0, gy).y * H;
    grid.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" />`);
  }
  const label = (text: string, x: number, y: number, extra = "") =>
    `<text x="${(gameToMap(x, y).x * W).toFixed(1)}" y="${(gameToMap(x, y).y * H).toFixed(1)}" ${extra}>${esc(text)}</text>`;
  const pins = markers
    .map((m, i) => {
      const x = (m.mapX * W).toFixed(1);
      const y = (m.mapY * H).toFixed(1);
      const primary = m.primary ?? i === 0;
      return `<g class="pin${primary ? " pin-primary" : ""}" transform="translate(${x} ${y})">
        ${primary ? `<circle r="22" class="pulse" />` : ""}
        <circle r="${primary ? 9 : 6}" class="dot" />
        <circle r="${primary ? 3.5 : 2.5}" class="core" />
        ${primary ? `<text y="-16" text-anchor="middle" class="pin-label">${esc(m.name)}</text>` : ""}
      </g>`;
    })
    .join("");
  const xmlns = opts.standalone ? ` xmlns="http://www.w3.org/2000/svg"` : "";
  return `<svg${xmlns} viewBox="${opts.viewBox ?? `0 0 ${W} ${H}`}" role="img" aria-label="${esc(opts.label ?? "Schematic map of San Andreas")}" preserveAspectRatio="xMidYMid meet">
  <style>
    .sea{fill:#0e1a22}.land{fill:#23252a;stroke:#3b3d44;stroke-width:2;stroke-linejoin:round}.city{fill:#2e3036}.lake{fill:#0e1a22}
    .mtn{fill:#33353b}.grid line{stroke:#ffffff;stroke-opacity:.05;stroke-width:1}
    .lbl{font:600 15px system-ui,sans-serif;letter-spacing:.22em;fill:#8d8a83;opacity:.8}.sea-lbl{fill:#5b7f91;opacity:.55}
    .dot{fill:#f08a3c;stroke:#0b0b0c;stroke-width:2}.core{fill:#fff3e6}.pulse{fill:#f08a3c;opacity:.22}
    .pin-label{font:700 17px system-ui,sans-serif;fill:#ece7df;paint-order:stroke;stroke:#0b0b0c;stroke-width:5px;stroke-linejoin:round}
  </style>
  <rect class="sea" width="${W}" height="${H}" />
  <g class="grid">${grid.join("")}</g>
  <polygon class="land" points="${poly(LAND)}" />
  <polygon class="city" points="${poly(LOS_SANTOS)}" opacity=".85" />
  <polygon class="lake" points="${poly(ALAMO)}" />
  <polygon class="mtn" points="${poly(CHILIAD)}" />
  ${label("LOS SANTOS", -250, -800, `text-anchor="middle" class="lbl"`)}
  ${label("BLAINE COUNTY", 700, 4950, `text-anchor="middle" class="lbl"`)}
  ${label("PACIFIC OCEAN", -3900, -2000, `text-anchor="start" class="lbl sea-lbl"`)}
  ${label("ALAMO SEA", 1520, 4130, `text-anchor="middle" class="lbl sea-lbl" style="font-size:11px"`)}
  ${pins}
</svg>`;
}
