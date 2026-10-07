"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { TOPICS, useLang } from "@/lib/ui/i18n";

export interface Health {
  ok: boolean;
  ai: { configured: boolean; provider?: string; model?: string };
  embeddings: { model: string };
  database: { reachable: boolean; kind: string | null; entities: number; chunks: number };
}

const LINKS: Array<[string, string]> = [
  ["Rockstar Support", "https://support.rockstargames.com/gta-v"],
  ["GTA Wiki", "https://gta.fandom.com/wiki/Grand_Theft_Auto_V"],
  ["IGN interactive map", "https://www.ign.com/wikis/gta-5/GTA_5_Interactive_Map%3A_All_Quests%2C_Collectibles%2C_Locations_and_More"],
];

export function SidebarContent({ health, spoilers, onSpoilers, onAsk, onNew }: {
  health: Health | null;
  spoilers: boolean;
  onSpoilers: (v: boolean) => void;
  onAsk: (q: string) => void;
  onNew: () => void;
}) {
  const { lang, t } = useLang();
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto p-4 scroll-thin">
      <button type="button" onClick={onNew} className="rounded-xl border border-line bg-raise px-3 py-2 text-sm font-medium transition hover:border-ember/60 hover:text-ember">
        {t("newConversation")}
      </button>

      <section aria-label={t("scope")} className="rounded-xl border border-line bg-panel/70 p-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{t("scope")}</p>
        <p className="mt-1 text-sm text-bone">{t("storyOnly")}</p>
        <p className="mt-0.5 text-xs leading-snug text-mute">{t("scopeText")}</p>
      </section>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-panel/70 p-3">
        <div>
          <p id="spoiler-label" className="text-sm text-bone">{t("spoilers")}</p>
          <p className="text-xs text-mute">{t("spoilersHint")}</p>
        </div>
        <button
          type="button" role="switch" aria-checked={spoilers} aria-labelledby="spoiler-label" onClick={() => onSpoilers(!spoilers)}
          className={cn("relative h-6 w-11 rounded-full border border-line transition", spoilers ? "bg-ember" : "bg-raise")}
        >
          <span className={cn("absolute top-0.5 size-4.5 rounded-full bg-bone transition-all", spoilers ? "left-[1.35rem]" : "left-0.5")} />
        </button>
      </div>

      <Link href="/map" className="rounded-xl border border-line bg-panel/70 px-3 py-2 text-sm text-bone transition hover:border-ember/60 hover:text-ember">🗺 {t("openFullMap")}</Link>

      <nav aria-label={t("explore")}>
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{t("explore")}</p>
        <ul className="grid gap-1">
          {TOPICS[lang].map(([label, q]) => (
            <li key={label}>
              <button type="button" onClick={() => onAsk(q)} className="w-full rounded-lg px-2.5 py-1.5 text-left text-sm text-bone transition hover:bg-raise hover:text-ember">{label}</button>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-label={t("system")} className="mt-auto rounded-xl border border-line bg-panel/70 p-3 text-xs text-mute">
        <p className="mb-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em]">{t("system")}</p>
        {health ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt>{t("ai")}</dt><dd className="text-bone">{health.ai.configured ? `${health.ai.provider} · ${health.ai.model}` : t("demoNoProvider")}</dd>
            <dt>{t("knowledge")}</dt><dd className="text-bone">{health.database.entities > 0 ? `${health.database.entities} entities · ${health.database.chunks} chunks` : t("emptyKb")}</dd>
            <dt>{t("store")}</dt><dd className="text-bone">{health.database.kind === "pg" ? "PostgreSQL" : "PGlite (Postgres)"} + pgvector</dd>
            <dt>Embeddings</dt><dd className="truncate text-bone" title={health.embeddings.model}>{health.embeddings.model}</dd>
          </dl>
        ) : <p>{t("checking")}</p>}
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {LINKS.map(([label, href]) => (
            <li key={href}><a className="underline-offset-2 hover:text-ember hover:underline" href={href} target="_blank" rel="noopener noreferrer">{label} ↗</a></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
