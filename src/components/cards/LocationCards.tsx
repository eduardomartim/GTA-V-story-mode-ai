"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { MAP_VIEWBOX, mapToViewBox } from "@/lib/map/projection";
import { mapSvgMarkup } from "@/lib/map/svg";
import type { CardData, Lang } from "@/lib/rag/types";
import { safeUrl } from "@/lib/security/url";
import { ORIGINS, bearing, ui } from "@/lib/ui/text";
import { Badge, CardShell, Fact, Facts, Summary, linkBtn } from "./CardShell";

type LocationData = Extract<CardData, { kind: "location" }>;
type MapData = Extract<CardData, { kind: "map" }>;

/** Crops the schematic map around a point so the card stays compact; `full` shows the whole island. */
function cropViewBox(mapX: number, mapY: number): string {
  const w = 300;
  const h = 210;
  const p = mapToViewBox({ x: mapX, y: mapY });
  const x = Math.min(Math.max(p.x - w / 2, 0), MAP_VIEWBOX.width - w);
  const y = Math.min(Math.max(p.y - h / 2, 0), MAP_VIEWBOX.height - h);
  return `${x.toFixed(0)} ${y.toFixed(0)} ${w} ${h}`;
}

function MapSvg({ markers, viewBox, label }: { markers: Array<{ name: string; mapX: number; mapY: number }>; viewBox?: string; label: string }) {
  // Trusted markup: generated from constants by mapSvgMarkup(), marker names are HTML-escaped there.
  return <div className="[&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: mapSvgMarkup(markers, { viewBox, label }) }} />;
}

function Directions({ gameX, gameY, lang }: { gameX: number; gameY: number; lang: Lang }) {
  const [origin, setOrigin] = useState<(typeof ORIGINS)[number]["id"]>("michael");
  const o = ORIGINS.find((x) => x.id === origin) ?? ORIGINS[0];
  const b = bearing(o.x, o.y, gameX, gameY, lang);
  const id = useId();
  return (
    <div className="mt-2 rounded-lg border border-line bg-raise/70 p-2.5 text-sm">
      <label htmlFor={id} className="text-[0.7rem] uppercase tracking-wider text-mute">{ui("fromOrigin", lang)}</label>
      <select id={id} value={origin} onChange={(e) => setOrigin(e.target.value as typeof origin)} className="mt-1 w-full rounded-md border border-line bg-char px-2 py-1.5 text-sm text-bone">
        {ORIGINS.map((x) => <option key={x.id} value={x.id}>{x.name[lang]}</option>)}
      </select>
      <p className="mt-2 text-bone">≈ {b.km.toFixed(1)} km → {b.dir}</p>
      <p className="text-[0.7rem] text-mute">{ui("straightLine", lang)}</p>
    </div>
  );
}

export function LocationCard({ card, lang }: { card: LocationData; lang: Lang }) {
  const [showDir, setShowDir] = useState(false);
  const ext = safeUrl(card.externalMapUrl);
  const where = [card.district, card.region].filter(Boolean).join(" · ");
  const hasPos = card.gameX !== undefined && card.gameY !== undefined;
  return (
    <CardShell
      label={`📍 ${ui("location", lang)}`}
      title={card.name}
      accent="tide"
      actions={
        <>
          {ext ? <a className={linkBtn} href={ext} target="_blank" rel="noopener noreferrer">↗ {ui("openMap", lang)}</a> : null}
          {hasPos ? (
            <button type="button" className={linkBtn} aria-expanded={showDir} onClick={() => setShowDir((v) => !v)}>
              ➜ {ui("howToGetThere", lang)}
            </button>
          ) : null}
        </>
      }
    >
      <Facts>
        <Fact k={ui("where", lang)} v={where || "San Andreas"} />
        <Fact k={ui("map", lang)} v={<Badge tone={card.precision === "verified" ? "tide" : "mute"}>{({ approximate: { pt: "aproximada", en: "approximate" }, verified: { pt: "verificada", en: "verified" }, community: { pt: "coord. comunidade", en: "community coords" }, area: { pt: "só a área", en: "area only" }, unknown: { pt: "desconhecida", en: "unknown" } } as Record<string, { pt: string; en: string }>)[card.precision]?.[lang] ?? card.precision}</Badge>} />
      </Facts>
      <Summary text={card.summary} />
      {showDir && hasPos ? <Directions gameX={card.gameX as number} gameY={card.gameY as number} lang={lang} /> : null}
    </CardShell>
  );
}

export function MapCard({ card, lang }: { card: MapData; lang: Lang }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const ext = safeUrl(card.externalMapUrl);
  const markers = card.markers.map((m, i) => ({ name: m.name, mapX: m.mapX, mapY: m.mapY, primary: i === 0 }));

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <CardShell
      label={`🗺️ ${ui("map", lang)}`}
      title={card.name}
      accent="tide"
      actions={
        <>
          <button type="button" className={linkBtn} onClick={() => setOpen(true)}>⤢ {ui("expand", lang)}</button>
          <Link className={linkBtn} href={`/map?focus=${encodeURIComponent(card.markers.find((m) => m.id !== "anchor")?.id ?? card.entityId)}`}>🗺 {ui("seeOnMap", lang)}</Link>
          {ext ? <a className={linkBtn} href={ext} target="_blank" rel="noopener noreferrer">↗ {ui("openMap", lang)}</a> : null}
        </>
      }
    >
      <div className="mt-2 overflow-hidden rounded-lg border border-line">
        <MapSvg markers={markers} viewBox={cropViewBox(card.mapX, card.mapY)} label={`${ui("map", lang)}: ${card.name}`} />
      </div>
      <p className="mt-1.5 text-[0.7rem] leading-snug text-mute">{ui("approxPos", lang)} · {ui("schematic", lang)}</p>
      <dialog ref={dialog} onClose={() => setOpen(false)} onClick={(e) => e.target === dialog.current && setOpen(false)} aria-label={`${ui("map", lang)}: ${card.name}`}
        className="m-auto max-h-[92dvh] w-[min(92vw,560px)] overflow-auto rounded-2xl border border-line bg-char p-3 text-bone backdrop:bg-black/70">
        <div className="flex items-center justify-between pb-2">
          <h4 className="font-display text-xl tracking-wide">{card.name}</h4>
          <button type="button" className={linkBtn} onClick={() => setOpen(false)} autoFocus>✕ {ui("close", lang)}</button>
        </div>
        <MapSvg markers={markers} label={`${ui("map", lang)}: ${card.name}`} />
        <p className="mt-2 text-xs text-mute">{ui("approxPos", lang)} · {ui("schematic", lang)}</p>
      </dialog>
    </CardShell>
  );
}
