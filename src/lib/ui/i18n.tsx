"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Lang } from "@/lib/rag/types";

/**
 * UI language. "auto" = follow the browser for the interface and the language of each question for answers;
 * "pt"/"en" = interface AND answers in that language (the choice is sent with every chat request).
 */
export type LangPref = "auto" | Lang;

const STORAGE_KEY = "gta-story-ai:lang";

const T = {
  appTitle: { pt: "GTA V Story AI — assistente do Modo História", en: "GTA V Story AI — Story Mode assistant" },
  skip: { pt: "Pular para a caixa de mensagem", en: "Skip to message box" },
  openMenu: { pt: "Abrir menu", en: "Open menu" },
  closeMenu: { pt: "Fechar menu", en: "Close menu" },
  menu: { pt: "Menu", en: "Menu" },
  search: { pt: "Buscar", en: "Search" },
  searchKb: { pt: "Buscar na base de conhecimento (Ctrl+K)", en: "Search the knowledge base (Ctrl+K)" },
  searchPlaceholder: { pt: "Buscar missões, personagens, lugares, veículos…", en: "Search missions, characters, places, vehicles…" },
  searching: { pt: "Buscando…", en: "Searching…" },
  searchError: { pt: "A busca está indisponível agora.", en: "Search is unavailable right now." },
  noResults: { pt: "Nada encontrado.", en: "Nothing found." },
  serviceStatus: { pt: "Status do serviço", en: "Service status" },
  degraded: { pt: "Base de conhecimento indisponível", en: "Knowledge base unavailable" },
  demoTitle: { pt: "Provedor de IA não configurado — modo demo", en: "AI provider not configured — demo mode" },
  footer: { pt: "Agente feito por fã · sem afiliação com a Rockstar Games · as respostas citam as fontes", en: "Fan-made knowledge agent · not affiliated with Rockstar Games · answers cite their sources" },
  thirdPartyData: { pt: "dados de terceiros", en: "third-party data" },
  newConversation: { pt: "＋ Nova conversa", en: "＋ New conversation" },
  scope: { pt: "Escopo", en: "Scope" },
  storyOnly: { pt: "Somente Modo História.", en: "Story Mode only." },
  scopeText: { pt: "Conteúdo do GTA Online é detectado e mantido fora das respostas.", en: "GTA Online content is detected and kept out of the answers." },
  spoilers: { pt: "Permitir spoilers", en: "Allow spoilers" },
  spoilersHint: { pt: "Finais, mortes, reviravoltas", en: "Endings, deaths, twists" },
  explore: { pt: "Explorar", en: "Explore" },
  system: { pt: "Sistema", en: "System" },
  ai: { pt: "IA", en: "AI" },
  knowledge: { pt: "Conhecimento", en: "Knowledge" },
  store: { pt: "Banco", en: "Store" },
  embeddings: { pt: "Embeddings", en: "Embeddings" },
  demoNoProvider: { pt: "demo (sem provedor)", en: "demo (no provider)" },
  emptyKb: { pt: "vazia — rode npm run db:seed", en: "empty — run npm run db:seed" },
  checking: { pt: "Verificando…", en: "Checking…" },
  composerLabel: { pt: "Pergunte qualquer coisa sobre o Modo História do GTA V", en: "Ask anything about GTA V Story Mode" },
  placeholderWide: { pt: "Pergunte qualquer coisa sobre o Modo História do GTA V…", en: "Ask anything about GTA V Story Mode…" },
  placeholderNarrow: { pt: "Pergunte sobre o Modo História…", en: "Ask about GTA V Story Mode…" },
  send: { pt: "Enviar mensagem", en: "Send message" },
  heroKicker: { pt: "Grand Theft Auto V · Modo História", en: "Grand Theft Auto V · Story Mode" },
  heroTagline: { pt: "Seu especialista em Los Santos.", en: "Your specialist for Los Santos." },
  heroText: {
    pt: "Pergunte qualquer coisa sobre o Modo História do GTA V. As respostas vêm de uma base de conhecimento com fontes — e ele avisa quando não sabe.",
    en: "Ask anything about Grand Theft Auto V Story Mode. Answers are grounded in a sourced knowledge base — and it says so when it doesn’t know.",
  },
  suggested: { pt: "Perguntas sugeridas", en: "Suggested questions" },
  typing: { pt: "Consultando a base de conhecimento…", en: "Searching the knowledge base…" },
  errorGeneric: { pt: "Algo deu errado. Tente novamente.", en: "Something went wrong. Please try again." },
  errorNetwork: { pt: "Não consegui falar com o servidor. Verifique sua conexão e tente novamente.", en: "I couldn't reach the server. Check your connection and try again." },
  retry: { pt: "↻ Tentar de novo", en: "↻ Retry" },
  language: { pt: "Idioma", en: "Language" },
  langAuto: { pt: "Automático", en: "Automatic" },
  map: { pt: "Mapa", en: "Map" },
  openFullMap: { pt: "Mapa interativo", en: "Interactive map" },
  chat: { pt: "Chat", en: "Chat" },
  seeOnMap: { pt: "Ver no mapa", en: "See on map" },
  askAbout: { pt: "Perguntar ao agente", en: "Ask the agent" },
  backToMap: { pt: "Voltar ao mapa", en: "Back to the map" },
} satisfies Record<string, Record<Lang, string>>;

export type ChromeKey = keyof typeof T;

export const TOPICS: Record<Lang, Array<[string, string]>> = {
  pt: [
    ["Missões e heists", "Quais são todas as missões do Lester?"],
    ["Colecionáveis", "Quais são todas as peças de nave?"],
    ["100%", "Como completar 100%?"],
    ["Relacionamentos", "Como conseguir uma namorada pro Trevor?"],
    ["Cheats (PC)", "Quais são os códigos de cheat do PC?"],
    ["Dinheiro e ações", "Como funciona a bolsa de valores?"],
    ["Finais", "Qual final é o melhor?"],
  ],
  en: [
    ["Missions & heists", "Show me all Lester missions"],
    ["Collectibles", "List all spaceship parts"],
    ["100% completion", "How do I get 100% completion?"],
    ["Relationships", "How do I get a girlfriend for Trevor?"],
    ["Cheats (PC)", "What are the PC cheat codes?"],
    ["Money & stocks", "How does the stock market work?"],
    ["Endings", "Which ending is the best?"],
  ],
};

export const SUGGESTIONS: Record<Lang, string[]> = {
  pt: [
    "Como completar 100%?",
    "Mostre as 5 peças de nave mais próximas de Sandy Shores.",
    "Onde encontro a Ursula?",
    "Quais atividades do Trevor contam para 100%?",
    "Como fazer The Big Score?",
  ],
  en: [
    "How do I get 100% completion?",
    "Show the 5 spaceship parts closest to Sandy Shores.",
    "Where do I find Ursula?",
    "Which of Trevor's activities count for 100%?",
    "How do I do The Big Score?",
  ],
};

/** A chrome string in an explicit language (e.g. the language the question was asked in). */
export function chrome(k: ChromeKey, lang: Lang): string {
  return T[k][lang];
}

interface Ctx { pref: LangPref; lang: Lang; setPref: (p: LangPref) => void; t: (k: ChromeKey) => string }

const LangContext = createContext<Ctx | null>(null);

function browserLang(): Lang {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("pt") ? "pt" : "en";
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>("auto");
  const [browser, setBrowser] = useState<Lang>("en");
  useEffect(() => {
    // Browser language and the stored choice only exist on the client.
    /* eslint-disable react-hooks/set-state-in-effect */
    setBrowser(browserLang());
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "pt" || v === "en" || v === "auto") setPrefState(v);
    } catch { /* storage unavailable: keep "auto" */ }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const setPref = useCallback((p: LangPref) => {
    setPrefState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
  }, []);
  const lang: Lang = pref === "auto" ? browser : pref;
  useEffect(() => { document.documentElement.lang = lang === "pt" ? "pt-BR" : "en"; }, [lang]);
  const value = useMemo<Ctx>(() => ({ pref, lang, setPref, t: (k) => T[k][lang] }), [pref, lang, setPref]);
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** Falls back to English outside a provider (isolated component tests). */
export function useLang(): Ctx {
  return useContext(LangContext) ?? { pref: "auto", lang: "en", setPref: () => {}, t: (k) => T[k].en };
}

export function LanguageSelect({ className }: { className?: string }) {
  const { pref, setPref, t } = useLang();
  return (
    <label className={className}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={pref}
        onChange={(e) => setPref(e.target.value as LangPref)}
        aria-label={t("language")}
        className="h-9 rounded-lg border border-line bg-raise px-2 text-sm text-bone transition hover:border-ember/60 focus-visible:border-ember"
      >
        <option value="auto">🌐 {t("langAuto")}</option>
        <option value="pt">🇧🇷 Português</option>
        <option value="en">🇺🇸 English</option>
      </select>
    </label>
  );
}
