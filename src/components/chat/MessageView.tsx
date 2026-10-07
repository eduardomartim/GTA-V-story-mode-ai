"use client";

import { memo } from "react";
import { CardGrid } from "@/components/cards/CardRenderer";
import { SourceCard, SpoilerCard } from "@/components/cards/MessageCards";
import { cn } from "@/lib/cn";
import type { ChatResult } from "@/lib/rag/types";
import { t } from "@/lib/rag/messages";
import { useLang } from "@/lib/ui/i18n";
import { ui } from "@/lib/ui/text";
import { SafeMarkdown } from "./SafeMarkdown";

export interface UiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  result?: ChatResult;
  error?: { code: string; message: string };
  /** The question that produced an error, so it can be retried. */
  retryOf?: string;
}

const MODE_LABEL: Record<ChatResult["mode"], { pt: string; en: string } | null> = {
  llm: null,
  structured: { pt: "consulta estruturada · sem LLM", en: "structured lookup · no LLM" },
  "no-evidence": { pt: "sem evidência", en: "no evidence" },
  clarify: { pt: "precisa de contexto", en: "needs context" },
  "online-boundary": { pt: "proteção Modo História", en: "story-mode guard" },
  demo: { pt: "demo · sem provedor de IA", en: "demo · no AI provider" },
};

function Avatar() {
  return (
    <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-raise font-display text-lg leading-none text-ember">
      V
    </span>
  );
}

export const MessageView = memo(function MessageView({ message, onAsk, onRetry }: {
  message: UiMessage;
  onAsk: (q: string) => void;
  onRetry: (q: string) => void;
}) {
  const { t: tc } = useLang();
  if (message.role === "user") {
    return (
      <div className="msg-in flex justify-end">
        <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md border border-line bg-raise px-3.5 py-2 text-[0.95rem] leading-relaxed text-bone sm:max-w-[75%]">
          {message.content}
        </p>
      </div>
    );
  }

  const r = message.result;
  const lang = r?.lang ?? "pt";
  const modeLabel = r ? MODE_LABEL[r.mode]?.[lang] ?? null : null;
  return (
    <div className="msg-in flex gap-3" data-testid="assistant-message">
      <Avatar />
      <div className="min-w-0 flex-1">
        <h2 className="sr-only">{lang === "pt" ? "Resposta do assistente" : "Assistant answer"}</h2>
        {message.error ? (
          <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
            <p className="text-bone">{message.error.message}</p>
            {message.retryOf ? (
              <button type="button" onClick={() => onRetry(message.retryOf as string)} className="mt-2 rounded-lg border border-line bg-raise px-3 py-1.5 text-xs font-medium hover:border-ember/60 hover:text-ember">
                {tc("retry")}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {r?.spoiler ? <div className="mb-2"><SpoilerCard text={t("spoiler", lang)} /></div> : null}
            <SafeMarkdown text={message.content} messageId={message.id} />
            {r ? <CardGrid cards={r.cards} lang={lang} onAsk={onAsk} /> : null}
            {r && r.sources.length > 0 ? (
              <section aria-label={ui("sources", lang)} className="mt-3">
                <h4 className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">
                  {r.meta.cited === false && r.mode === "llm"
                    ? lang === "pt" ? "Fontes consultadas (não citadas na resposta)" : "Sources consulted (not cited in the answer)"
                    : ui("sources", lang)}
                </h4>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {r.sources.map((s) => <SourceCard key={s.index} source={s} messageId={message.id} lang={lang} />)}
                </ul>
              </section>
            ) : null}
            {r && r.sources.some((s) => s.verification === "unverified") ? (
              <p role="note" className="mt-2 text-xs text-danger" data-testid="unverified-note">
                ⚠️ {lang === "pt" ? "Parte desta resposta vem de informação não verificada ou com fontes divergentes." : "Part of this answer relies on unverified or conflicting information."}
              </p>
            ) : null}
            {r && r.followUps.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label={lang === "pt" ? "Sugestões de continuação" : "Suggested follow-ups"}>
                {r.followUps.map((f) => (
                  <button key={f.label} type="button" onClick={() => onAsk(f.query)}
                    className="rounded-full border border-line bg-panel/80 px-3 py-1 text-xs font-medium text-bone transition hover:border-ember/60 hover:text-ember">
                    {f.label}
                  </button>
                ))}
              </div>
            ) : null}
            {r ? (
              <p className={cn("mt-2 text-[0.68rem] text-mute/80")}>
                {[modeLabel, r.meta.model, `${r.meta.latencyMs} ms`].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
});
