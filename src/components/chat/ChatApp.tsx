"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DATASET_NOTICES } from "@/lib/map/attribution";
import { detectLang } from "@/lib/rag/lang";
import { LanguageSelect, chrome, useLang } from "@/lib/ui/i18n";
import type { ChatResult } from "@/lib/rag/types";
import type { SearchHit } from "@/lib/rag/search";
import { Composer, type ComposerHandle } from "./Composer";
import { EmptyState } from "./EmptyState";
import { MessageView, type UiMessage } from "./MessageView";
import { SearchDialog } from "./SearchDialog";
import { SidebarContent, type Health } from "./Sidebar";
import { TypingIndicator } from "./TypingIndicator";

const STORAGE_KEY = "gta-story-ai:v1";

function stripMarkdown(s: string): string {
  return s.replace(/\[(\d+)\]\(#source-\d+\)/g, "").replace(/[*_`>#]/g, "").slice(0, 1500);
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

function loadStored(): { messages: UiMessage[]; spoilers: boolean } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { messages: UiMessage[]; spoilers: boolean };
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return { messages: [], spoilers: false };
}

export function ChatApp() {
  const { pref, lang: uiLang, t } = useLang();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [spoilers, setSpoilers] = useState(false);
  const [loading, setLoading] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const composer = useRef<ComposerHandle>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDialogElement>(null);
  const abort = useRef<AbortController | null>(null);
  const lastAssistant = useRef<string | null>(null);

  useEffect(() => {
    // Hydrating from sessionStorage must happen after mount (it does not exist during SSR).
    /* eslint-disable react-hooks/set-state-in-effect */
    const stored = loadStored();
    setMessages(stored.messages);
    setSpoilers(stored.spoilers);
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    fetch("/api/health").then((r) => r.json()).then((h: Health) => setHealth(h)).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-30), spoilers })); } catch { /* ignore */ }
  }, [messages, spoilers, hydrated]);

  useEffect(() => {
    const d = menu.current;
    if (!d) return;
    if (menuOpen && !d.open) d.showModal();
    if (!menuOpen && d.open) d.close();
  }, [menuOpen]);

  // scroll: user messages → bottom; a fresh assistant answer → its first line
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    if (last?.role === "assistant" && lastAssistant.current !== last.id) {
      lastAssistant.current = last.id;
      el.querySelector(`[data-mid="${last.id}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === "/" && !(e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) { e.preventDefault(); composer.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const send = useCallback(async (text: string, base?: UiMessage[]) => {
    const current = base ?? messages;
    const userMsg: UiMessage = { id: uid(), role: "user", content: text };
    const history = current
      .filter((m) => !m.error)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.role === "assistant" ? stripMarkdown(m.content) : m.content, entities: m.result?.meta.entities }));
    setMessages([...current, userMsg]);
    setLoading(true);
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    // Automatic mode: messages follow the language of the question; otherwise the chosen language.
    const msgLang = pref === "auto" ? detectLang(text) : pref;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history, allowSpoilers: spoilers, ...(pref === "auto" ? {} : { lang: pref }) }),
        signal: ctrl.signal,
      });
      const json = (await res.json().catch(() => null)) as (ChatResult & { error?: undefined }) | { error: { code: string; message: string } } | null;
      if (!res.ok || !json || "error" in json) {
        const err = json && "error" in json && json.error ? json.error : { code: "internal", message: chrome("errorGeneric", msgLang) };
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: "", error: err, retryOf: text }]);
      } else {
        setMessages((m) => [...m, { id: uid(), role: "assistant", content: json.answer, result: json }]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      const message = chrome("errorNetwork", msgLang);
      setMessages((m) => [...m, { id: uid(), role: "assistant", content: "", error: { code: "network", message }, retryOf: text }]);
    } finally {
      if (abort.current === ctrl) setLoading(false);
    }
  }, [messages, spoilers, pref]);

  // Deep link from the map ("Ask the agent"): /?q=<question> is sent once after hydration, then removed from the URL.
  const deepLinked = useRef(false);
  const [backToMap, setBackToMap] = useState<string | null>(null);
  useEffect(() => {
    if (!hydrated || deepLinked.current) return;
    deepLinked.current = true;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q")?.trim().slice(0, 600);
    if (!q) return;
    const focus = params.get("focus");
    // Only an entity id (type:slug) is accepted back into the map link.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (params.get("from") === "map" && focus && /^[a-z_]+:[a-z0-9-]+$/.test(focus)) setBackToMap(focus);
    window.history.replaceState(null, "", window.location.pathname);
    // Sending a deep-linked question is an external-input reaction (the URL), not derived state.
    void send(q);
  }, [hydrated, send]);

  const ask = useCallback((q: string) => { setMenuOpen(false); void send(q); }, [send]);
  const retry = useCallback((q: string) => {
    // drop the trailing error bubble and the user message that caused it, then resend
    const trimmed = messages.slice(0, -2);
    void send(q, trimmed);
  }, [messages, send]);
  const reset = useCallback(() => { abort.current?.abort(); setMessages([]); setLoading(false); setMenuOpen(false); composer.current?.focus(); }, []);

  const pickSearch = useCallback((hit: SearchHit) => {
    setSearchOpen(false);
    const pt = uiLang === "pt";
    const q = hit.type === "mission" || hit.type === "heist"
      ? (pt ? `Como fazer ${hit.name}?` : `How do I do ${hit.name}?`)
      : hit.type === "location" ? (pt ? `Onde fica ${hit.name}?` : `Where is ${hit.name}?`)
      : (pt ? `Fale sobre ${hit.name}` : `Tell me about ${hit.name}`);
    void send(q);
  }, [send, uiLang]);

  const status = useMemo(() => {
    if (!health) return { label: "ONLINE", tone: "text-tide", dot: "bg-tide", title: t("serviceStatus") };
    if (!health.ok) return { label: "DEGRADED", tone: "text-danger", dot: "bg-danger", title: t("degraded") };
    if (!health.ai.configured) return { label: "DEMO", tone: "text-ember", dot: "bg-ember", title: t("demoTitle") };
    return { label: "ONLINE", tone: "text-tide", dot: "bg-tide", title: `${health.ai.provider} · ${health.ai.model}` };
  }, [health, t]);

  const sidebar = <SidebarContent health={health} spoilers={spoilers} onSpoilers={setSpoilers} onAsk={ask} onNew={reset} />;
  const empty = messages.length === 0 && !loading; // also rendered pre-hydration (SSR) so first paint shows the hero

  return (
    <div className="relative z-10 flex h-dvh flex-col">
      <a href="#composer" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-ember focus:px-3 focus:py-2 focus:text-ink">{t("skip")}</a>
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line/80 bg-ink/70 px-3 backdrop-blur-sm sm:px-5">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setMenuOpen(true)} aria-label={t("openMenu")} className="grid size-9 place-items-center rounded-lg border border-line bg-raise lg:hidden">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <span className="font-display text-2xl leading-none tracking-[0.08em]">GTA V <span className="text-ember">STORY</span> AI</span>
        </div>
        <div className="flex items-center gap-2.5">
          {backToMap ? (
            <Link href={`/map?focus=${encodeURIComponent(backToMap)}`} className="flex h-9 items-center gap-1.5 rounded-lg border border-ember/50 bg-ember/10 px-2.5 text-sm text-ember transition hover:bg-ember/20">← {t("backToMap")}</Link>
          ) : (
            <Link href="/map" className="hidden h-9 items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 text-sm text-bone transition hover:border-ember/60 hover:text-ember sm:flex">🗺 {t("map")}</Link>
          )}
          <LanguageSelect />
          <span className={`flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-[0.18em] ${status.tone}`} title={status.title} role="status" aria-label={`${t("serviceStatus")}: ${status.label}`}>
            <span className={`size-2 rounded-full ${status.dot}`} aria-hidden="true" />{status.label}
          </span>
          <button type="button" onClick={() => setSearchOpen(true)} aria-label={t("searchKb")} className="flex h-9 items-center gap-2 rounded-lg border border-line bg-raise px-2.5 text-sm text-mute transition hover:border-ember/60 hover:text-ember">
            <span aria-hidden="true">⌕</span><span className="hidden sm:inline">{t("search")}</span><kbd className="hidden rounded border border-line px-1 text-[0.62rem] sm:inline">Ctrl K</kbd>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside aria-label={uiLang === "pt" ? "Barra lateral" : "Sidebar"} className="hidden w-72 shrink-0 border-r border-line/80 bg-ink/60 backdrop-blur-sm lg:block">{sidebar}</aside>
        <main className="flex min-w-0 flex-1 flex-col">
          <h1 className="sr-only">{t("appTitle")}</h1>
          <div ref={scroller} role="log" aria-live="polite" aria-relevant="additions" aria-label={uiLang === "pt" ? "Conversa" : "Conversation"} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-5">
              {empty ? <EmptyState onAsk={ask} /> : null}
              {messages.map((m) => (
                <div key={m.id} data-mid={m.id} className="scroll-mt-4"><MessageView message={m} onAsk={ask} onRetry={retry} /></div>
              ))}
              {loading ? <TypingIndicator /> : null}
            </div>
          </div>
          <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-6">
            <div className="mx-auto w-full max-w-3xl">
              <Composer ref={composer} disabled={loading} onSend={(t) => void send(t)} />
              <p className="mt-1.5 text-center text-[0.68rem] text-mute/80">
                {t("footer")} · {t("thirdPartyData")}:{" "}
                {DATASET_NOTICES.map((n, i) => (
                  <span key={n.dataset}>
                    {i ? ", " : ""}
                    <a href={n.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-ember">{n.source}</a>{" "}
                    (<a href={n.licenceUrl} target="_blank" rel="noopener noreferrer license" className="underline hover:text-ember">{n.licence}</a>)
                  </span>
                ))}
              </p>
            </div>
          </div>
        </main>
      </div>

      <dialog ref={menu} onClose={() => setMenuOpen(false)} onClick={(e) => e.target === menu.current && setMenuOpen(false)} aria-label={t("menu")}
        className="m-0 h-dvh max-h-none w-[min(86vw,320px)] border-r border-line bg-char p-0 text-bone backdrop:bg-black/70">
        <div className="flex h-full flex-col">
          <button type="button" onClick={() => setMenuOpen(false)} aria-label={t("closeMenu")} className="m-3 mb-0 self-end rounded-lg border border-line px-2.5 py-1 text-sm">✕</button>
          <div className="min-h-0 flex-1">{sidebar}</div>
        </div>
      </dialog>
      <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} onPick={pickSearch} />
    </div>
  );
}
