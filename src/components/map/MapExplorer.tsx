"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { MapMarker } from "@/lib/map/markers";
import { DATASET_NOTICES } from "@/lib/map/attribution";
import { MAP_VIEWBOX, gameToMap } from "@/lib/map/projection";
import { normalize } from "@/lib/text";
import { LanguageSelect, useLang } from "@/lib/ui/i18n";

type Lang = "pt" | "en";

const LAYER_META: Record<string, { pt: string; en: string; color: string; group: "story" | "collectibles" | "world" }> = {
  missions: { pt: "Missões", en: "Missions", color: "#f08a3c", group: "story" },
  strangers: { pt: "Strangers & Freaks", en: "Strangers & Freaks", color: "#e0b43a", group: "story" },
  "random-events": { pt: "Random Events", en: "Random Events", color: "#d96c8a", group: "story" },
  characters: { pt: "Personagens", en: "Characters", color: "#b48cf2", group: "story" },
  "letter-scraps": { pt: "Letter Scraps", en: "Letter Scraps", color: "#f4f1ea", group: "collectibles" },
  "spaceship-parts": { pt: "Peças de nave", en: "Spaceship Parts", color: "#5fd0e6", group: "collectibles" },
  "peyote-plants": { pt: "Peyote", en: "Peyote Plants", color: "#7ccf6b", group: "collectibles" },
  "nuclear-waste": { pt: "Lixo nuclear", en: "Nuclear Waste", color: "#c8e64a", group: "collectibles" },
  "submarine-pieces": { pt: "Peças do submarino", en: "Submarine Parts", color: "#4a8fe6", group: "collectibles" },
  "hidden-packages": { pt: "Pacotes escondidos", en: "Hidden Packages", color: "#e6c84a", group: "collectibles" },
  "epsilon-tracts": { pt: "Epsilon Tracts", en: "Epsilon Tracts", color: "#4ae6b4", group: "collectibles" },
  "under-the-bridge": { pt: "Under the Bridge", en: "Under the Bridge", color: "#9fb3c8", group: "collectibles" },
  "stunt-jumps": { pt: "Stunt Jumps", en: "Stunt Jumps", color: "#ff6b4a", group: "collectibles" },
  "knife-flights": { pt: "Knife Flights", en: "Knife Flights", color: "#c0c0c0", group: "collectibles" },
  "monkey-mosaics": { pt: "Monkey Mosaics", en: "Monkey Mosaics", color: "#d9a066", group: "collectibles" },
  safehouses: { pt: "Casas (safehouses)", en: "Safehouses", color: "#7de07d", group: "world" },
  landmarks: { pt: "Pontos de referência", en: "Landmarks", color: "#e6e6e6", group: "world" },
  areas: { pt: "Áreas", en: "Areas", color: "#8d8a83", group: "world" },
  properties: { pt: "Propriedades", en: "Properties", color: "#f2c46d", group: "world" },
  vehicles: { pt: "Veículos", en: "Vehicles", color: "#6dc2f2", group: "world" },
  weapons: { pt: "Armas", en: "Weapons", color: "#f26d6d", group: "world" },
  "easter-eggs": { pt: "Easter eggs", en: "Easter eggs", color: "#ff4ad9", group: "world" },
};

const TXT = {
  title: { pt: "Mapa interativo do Modo História", en: "Interactive Story Mode map" },
  back: { pt: "← Voltar ao chat", en: "← Back to chat" },
  layers: { pt: "Camadas", en: "Layers" },
  story: { pt: "História", en: "Story" },
  collectibles: { pt: "Colecionáveis", en: "Collectibles" },
  world: { pt: "Mundo", en: "World" },
  search: { pt: "Buscar no mapa…", en: "Search the map…" },
  all: { pt: "Todas", en: "All" },
  none: { pt: "Nenhuma", en: "None" },
  zoomIn: { pt: "Aproximar", en: "Zoom in" },
  zoomOut: { pt: "Afastar", en: "Zoom out" },
  reset: { pt: "Ver tudo", en: "Reset view" },
  coords: { pt: "Coordenadas no jogo", en: "In-game coordinates" },
  precision: { pt: "Precisão", en: "Precision" },
  ask: { pt: "Perguntar ao agente", en: "Ask the agent" },
  close: { pt: "Fechar", en: "Close" },
  loading: { pt: "Carregando marcadores…", en: "Loading markers…" },
  error: { pt: "Não foi possível carregar o mapa.", en: "The map could not be loaded." },
  shown: { pt: "marcadores visíveis", en: "markers shown" },
  results: { pt: "Resultados", en: "Results" },
  disclaimer: {
    pt: "Mapa-base: desenho esquemático original do projeto (não é a arte oficial do jogo). A linha tracejada é um litoral aproximado traçado a partir das coordenadas do esx_collectables (GPL-3.0). Marcadores usam coordenadas do jogo quando há uma fonte; caso contrário ficam no centro aproximado da área, e isso é indicado.",
    en: "Base map: the project's original schematic drawing (not the game's official artwork). The dashed line is an approximate coastline traced from the esx_collectables coordinates (GPL-3.0). Markers use in-game coordinates when a source provides them; otherwise they sit at the approximate centre of the area, and say so.",
  },
  via: { pt: "posição da área", en: "area position" },
  data: { pt: "Dados de terceiros", en: "Third-party data" },
} satisfies Record<string, Record<Lang, string>>;

const PRECISION: Record<MapMarker["precision"], Record<Lang, string>> = {
  verified: { pt: "verificada", en: "verified" },
  community: { pt: "coordenada medida pela comunidade", en: "community-measured coordinate" },
  approximate: { pt: "aproximada (ponto de referência)", en: "approximate (reference point)" },
  area: { pt: "apenas a área é conhecida", en: "only the area is known" },
};

interface VB { x: number; y: number; w: number; h: number }
const FULL: VB = { x: 0, y: 0, w: MAP_VIEWBOX.width, h: MAP_VIEWBOX.height };
const MIN_W = 40;

function clampVB(v: VB): VB {
  const w = Math.min(Math.max(v.w, MIN_W), FULL.w * 1.15);
  const h = (w / FULL.w) * FULL.h;
  const x = Math.min(Math.max(v.x, -w * 0.5), FULL.w - w * 0.5);
  const y = Math.min(Math.max(v.y, -h * 0.5), FULL.h - h * 0.5);
  return { x, y, w, h };
}

/** Optional, user-supplied base image calibrated to MAP_BOUNDS (only if the deployer has the rights to it). */
const BASE_IMAGE = process.env.NEXT_PUBLIC_MAP_BASE_IMAGE;

export function MapExplorer() {
  const { lang } = useLang();
  const tx = (k: keyof typeof TXT) => TXT[k][lang];
  const [markers, setMarkers] = useState<MapMarker[] | null>(null);
  const [coast, setCoast] = useState<Array<Array<[number, number]>> | null>(null);
  const [failed, setFailed] = useState(false);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["missions", "strangers", "letter-scraps", "spaceship-parts", "safehouses", "landmarks"]));
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MapMarker | null>(null);
  const [vb, setVb] = useState<VB>(FULL);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ pointers: Map<number, { x: number; y: number }>; start?: VB; dist?: number } >({ pointers: new Map() });

  useEffect(() => {
    let alive = true;
    fetch("/api/map").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d: { markers: MapMarker[]; coastline?: Array<Array<[number, number]>> | null }) => {
      if (!alive) return;
      setMarkers(d.markers);
      setCoast(d.coastline ?? null);
      // Deep links: /map?focus=<entity id>&layer=<layer>
      const params = new URLSearchParams(window.location.search);
      const focus = params.get("focus");
      const layer = params.get("layer");
      const hit = focus ? d.markers.find((m) => m.id === focus) : undefined;
      if (layer && LAYER_META[layer]) setEnabled((s) => new Set([...s, layer]));
      if (hit) {
        setEnabled((s) => new Set([...s, hit.layer]));
        setSelected(hit);
        setVb(clampVB({ x: hit.x * FULL.w - 90, y: hit.y * FULL.h - 125, w: 180, h: 250 }));
      }
    }).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, []);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of markers ?? []) c.set(m.layer, (c.get(m.layer) ?? 0) + 1);
    return c;
  }, [markers]);

  const q = normalize(query);
  const visible = useMemo(() => (markers ?? []).filter((m) => enabled.has(m.layer) && (!q || normalize(`${m.name} ${m.area ?? ""}`).includes(q))), [markers, enabled, q]);
  const results = useMemo(() => (q ? (markers ?? []).filter((m) => normalize(`${m.name} ${m.area ?? ""}`).includes(q)).slice(0, 12) : []), [markers, q]);

  const toSvg = useCallback((clientX: number, clientY: number) => {
    const el = svg.current;
    const ctm = el?.getScreenCTM();
    if (!el || !ctm) return { x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, [vb]);

  const zoomAt = useCallback((factor: number, cx?: number, cy?: number) => {
    setVb((v) => {
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      const w = v.w * factor;
      const h = v.h * factor;
      return clampVB({ x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h });
    });
  }, []);

  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toSvg(e.clientX, e.clientY);
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, p.x, p.y);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toSvg, zoomAt]);

  const onPointerDown = (e: RPointerEvent<SVGSVGElement>) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    drag.current.start = vb;
    const pts = [...drag.current.pointers.values()];
    drag.current.dist = pts.length === 2 ? Math.hypot((pts[0]?.x ?? 0) - (pts[1]?.x ?? 0), (pts[0]?.y ?? 0) - (pts[1]?.y ?? 0)) : undefined;
  };
  const onPointerMove = (e: RPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const prev = d.pointers.get(e.pointerId);
    if (!prev || !d.start) return;
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    const pts = [...d.pointers.values()];
    if (pts.length === 2 && d.dist) {
      const dist = Math.hypot((pts[0]?.x ?? 0) - (pts[1]?.x ?? 0), (pts[0]?.y ?? 0) - (pts[1]?.y ?? 0));
      const factor = d.dist / dist;
      const s = d.start;
      setVb(clampVB({ x: s.x + (s.w - s.w * factor) / 2, y: s.y + (s.h - s.h * factor) / 2, w: s.w * factor, h: s.h * factor }));
      return;
    }
    const scale = Math.max(d.start.w / rect.width, d.start.h / rect.height);
    const first = [...d.pointers.keys()][0] === e.pointerId;
    if (!first) return;
    setVb((v) => clampVB({ ...v, x: v.x - (e.clientX - prev.x) * scale, y: v.y - (e.clientY - prev.y) * scale }));
  };
  const onPointerUp = (e: RPointerEvent<SVGSVGElement>) => {
    drag.current.pointers.delete(e.pointerId);
    drag.current.start = vb;
    drag.current.dist = undefined;
  };

  const center = (m: MapMarker) => {
    setSelected(m);
    setEnabled((s) => (s.has(m.layer) ? s : new Set([...s, m.layer])));
    setVb(clampVB({ x: m.x * FULL.w - 90, y: m.y * FULL.h - 125, w: 180, h: 250 }));
  };

  const k = vb.w / FULL.w; // keeps markers a constant size on screen
  const groups = (["story", "collectibles", "world"] as const).map((g) => ({ g, layers: Object.entries(LAYER_META).filter(([, v]) => v.group === g) }));
  // The chat keeps the marker so it can offer "back to the map" at the same point.
  const askHref = (m: MapMarker) => `/?q=${encodeURIComponent(lang === "pt" ? `Onde fica ${m.name}?` : `Where is ${m.name}?`)}&from=map&focus=${encodeURIComponent(m.id)}`;

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line/80 bg-ink/80 px-3 backdrop-blur-sm sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="shrink-0 rounded-lg border border-line bg-raise px-2.5 py-1.5 text-sm text-bone hover:border-ember/60 hover:text-ember">{tx("back")}</Link>
          <h1 className="truncate font-display text-xl tracking-[0.06em] sm:text-2xl">{tx("title")}</h1>
        </div>
        <LanguageSelect />
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="scroll-thin order-2 max-h-[42dvh] shrink-0 overflow-y-auto border-t border-line/80 bg-ink/85 p-3 lg:order-1 lg:max-h-none lg:w-80 lg:border-r lg:border-t-0" aria-label={tx("layers")}>
          <label className="block">
            <span className="sr-only">{tx("search")}</span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tx("search")} aria-label={tx("search")}
              className="w-full rounded-lg border border-line bg-raise px-3 py-2 text-sm text-bone placeholder:text-mute/70 focus-visible:border-ember" />
          </label>
          {results.length ? (
            <div className="mt-2">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{tx("results")}</p>
              <ul className="mt-1 grid gap-1">
                {results.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => center(m)} className="w-full rounded-md px-2 py-1 text-left text-sm text-bone hover:bg-raise hover:text-ember">
                      <span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: LAYER_META[m.layer]?.color }} aria-hidden="true" />{m.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 flex items-center justify-between">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{tx("layers")}</p>
            <div className="flex gap-1.5 text-xs">
              <button type="button" className="rounded border border-line px-1.5 py-0.5 text-mute hover:text-ember" onClick={() => setEnabled(new Set(Object.keys(LAYER_META)))}>{tx("all")}</button>
              <button type="button" className="rounded border border-line px-1.5 py-0.5 text-mute hover:text-ember" onClick={() => setEnabled(new Set())}>{tx("none")}</button>
            </div>
          </div>
          {groups.map(({ g, layers }) => (
            <fieldset key={g} className="mt-2">
              <legend className="text-xs text-mute">{tx(g)}</legend>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 lg:grid-cols-1">
                {layers.map(([id, meta]) => (
                  <label key={id} className="flex cursor-pointer items-center gap-2 text-sm text-bone">
                    <input type="checkbox" checked={enabled.has(id)} onChange={() => setEnabled((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} className="accent-[#f08a3c]" />
                    <span className="inline-block size-2.5 rounded-full" style={{ background: meta.color }} aria-hidden="true" />
                    <span className="truncate">{meta[lang]}</span>
                    <span className="ml-auto text-xs tabular-nums text-mute">{counts.get(id) ?? 0}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <p className="mt-3 text-[0.7rem] leading-snug text-mute">{tx("disclaimer")}</p>
          <p className="mt-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{tx("data")}</p>
          <ul className="mt-1 space-y-1 text-[0.7rem] leading-snug text-mute">
            {DATASET_NOTICES.map((n) => (
              <li key={n.dataset}>
                <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ember">{n.source}</a>
                {" · "}
                <a href={n.licenceUrl} target="_blank" rel="noopener noreferrer license" className="underline hover:text-ember">{n.licence}</a>
              </li>
            ))}
          </ul>
        </aside>

        <main className="relative order-1 min-h-0 flex-1 overflow-hidden bg-[#0e1a22] lg:order-2">
          {failed ? <p className="p-4 text-danger" role="alert">{tx("error")}</p> : null}
          {!markers && !failed ? <p className="absolute left-3 top-3 z-10 text-sm text-mute">{tx("loading")}</p> : null}
          <svg
            ref={svg}
            viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
            className="size-full touch-none select-none"
            role="img"
            aria-label={tx("title")}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            tabIndex={0}
            onKeyDown={(e) => {
              const step = vb.w * 0.12;
              if (e.key === "+" || e.key === "=") zoomAt(1 / 1.25);
              else if (e.key === "-") zoomAt(1.25);
              else if (e.key === "ArrowLeft") setVb((v) => clampVB({ ...v, x: v.x - step }));
              else if (e.key === "ArrowRight") setVb((v) => clampVB({ ...v, x: v.x + step }));
              else if (e.key === "ArrowUp") setVb((v) => clampVB({ ...v, y: v.y - step }));
              else if (e.key === "ArrowDown") setVb((v) => clampVB({ ...v, y: v.y + step }));
              else return;
              e.preventDefault();
            }}
          >
            <image href="/maps/san-andreas.svg" x={0} y={0} width={FULL.w} height={FULL.h} />
            {BASE_IMAGE ? <image href={BASE_IMAGE} x={0} y={0} width={FULL.w} height={FULL.h} opacity={0.9} /> : null}
            {coast ? (
              <g aria-hidden="true" data-dataset="esx-collectables">
                {coast.map((shape, i) => (
                  <polygon key={i} points={shape.map(([gx, gy]) => { const p = gameToMap(gx, gy); return `${(p.x * FULL.w).toFixed(1)},${(p.y * FULL.h).toFixed(1)}`; }).join(" ")}
                    fill="none" stroke="#5b7f91" strokeOpacity={0.6} strokeWidth={1.5} strokeDasharray="5 4" />
                ))}
              </g>
            ) : null}
            {visible.map((m) => {
              const color = LAYER_META[m.layer]?.color ?? "#fff";
              const cx = m.x * FULL.w;
              const cy = m.y * FULL.h;
              const sel = selected?.id === m.id;
              const r = (sel ? 8 : 5) * k;
              return (
                <g key={m.id} onClick={(e) => { e.stopPropagation(); setSelected(m); }} className="cursor-pointer">
                  {m.precision === "area"
                    ? <circle cx={cx} cy={cy} r={r * 1.3} fill="none" stroke={color} strokeWidth={1.6 * k} strokeDasharray={`${2.5 * k} ${2 * k}`} />
                    : <circle cx={cx} cy={cy} r={r} fill={color} stroke="#0b0b0c" strokeWidth={1.4 * k} />}
                  {sel ? <circle cx={cx} cy={cy} r={r * 2.2} fill="none" stroke={color} strokeWidth={1.4 * k} opacity={0.7} /> : null}
                  <title>{m.name}</title>
                </g>
              );
            })}
          </svg>

          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            <button type="button" onClick={() => zoomAt(1 / 1.4)} aria-label={tx("zoomIn")} className="grid size-9 place-items-center rounded-lg border border-line bg-raise text-lg text-bone hover:text-ember">+</button>
            <button type="button" onClick={() => zoomAt(1.4)} aria-label={tx("zoomOut")} className="grid size-9 place-items-center rounded-lg border border-line bg-raise text-lg text-bone hover:text-ember">−</button>
            <button type="button" onClick={() => setVb(FULL)} aria-label={tx("reset")} className="grid size-9 place-items-center rounded-lg border border-line bg-raise text-sm text-bone hover:text-ember">⤢</button>
          </div>
          <p className="pointer-events-none absolute bottom-2 left-3 rounded bg-ink/70 px-2 py-0.5 text-xs text-mute">{visible.length} {tx("shown")}</p>

          {selected ? (
            <section className="absolute inset-x-3 bottom-9 max-h-[55%] overflow-y-auto rounded-xl border border-line bg-panel/95 p-3.5 shadow-xl sm:left-auto sm:w-96" aria-live="polite" aria-label={selected.name}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em]" style={{ color: LAYER_META[selected.layer]?.color }}>{LAYER_META[selected.layer]?.[lang] ?? selected.layer}</p>
                  <h2 className="font-display text-xl leading-tight tracking-wide text-bone">{selected.name}</h2>
                </div>
                <button type="button" onClick={() => setSelected(null)} aria-label={tx("close")} className="rounded border border-line px-2 py-0.5 text-sm text-mute hover:text-ember">✕</button>
              </div>
              {selected.area || selected.region ? <p className="mt-1 text-sm text-bone">📍 {[selected.area, selected.region].filter(Boolean).join(", ")}</p> : null}
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-mute">{tx("precision")}</dt><dd className="text-bone">{PRECISION[selected.precision][lang]}{selected.via ? ` (${tx("via")}: ${selected.via})` : ""}</dd>
                {selected.precision !== "area" ? (<><dt className="text-mute">{tx("coords")}</dt><dd className="tabular-nums text-bone">x {selected.gameX.toFixed(1)} · y {selected.gameY.toFixed(1)}{selected.gameZ !== undefined ? ` · z ${selected.gameZ.toFixed(1)}` : ""}</dd></>) : null}
              </dl>
              <p className="mt-2 text-sm leading-relaxed text-mute">{selected.summary}</p>
              <Link href={askHref(selected)} className="mt-3 inline-flex rounded-lg border border-ember/50 bg-ember/10 px-3 py-1.5 text-sm font-medium text-ember hover:bg-ember/20">💬 {tx("ask")}</Link>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
