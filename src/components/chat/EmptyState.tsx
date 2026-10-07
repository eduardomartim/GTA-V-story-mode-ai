"use client";

import { SUGGESTIONS, useLang } from "@/lib/ui/i18n";

export function EmptyState({ onAsk }: { onAsk: (q: string) => void }) {
  const { lang, t } = useLang();
  return (
    <section className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-2 py-10 text-center" aria-labelledby="hero-title">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-ember">{t("heroKicker")}</p>
      <h2 id="hero-title" className="mt-3 font-display text-6xl leading-[0.95] tracking-wide text-bone sm:text-7xl">
        GTA V <span className="text-ember">STORY</span> AI
      </h2>
      <p className="mt-4 text-xl text-bone/90">{t("heroTagline")}</p>
      <p className="mt-1.5 max-w-md text-sm text-mute">{t("heroText")}</p>
      <ul className="mt-7 flex w-full flex-wrap justify-center gap-2" aria-label={t("suggested")}>
        {SUGGESTIONS[lang].map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => onAsk(s)}
              className="rounded-xl border border-line bg-panel/80 px-3.5 py-2 text-sm text-bone transition hover:-translate-y-0.5 hover:border-ember/60 hover:text-ember"
            >
              {s}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
