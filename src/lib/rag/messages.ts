import type { Lang } from "./types";

type Bi<T> = { pt: T; en: T };

const TEXT = {
  noEvidence: {
    pt: "Não encontrei evidência suficiente na base de conhecimento para afirmar isso com segurança.",
    en: "I couldn't find enough evidence in the knowledge base to say that with confidence.",
  },
  notValidated: {
    pt: "Essa informação ainda não está validada na base.",
    en: "That information hasn't been validated in the knowledge base yet.",
  },
  noEvidenceHint: {
    pt: "Posso ajudar com missões, heists, personagens, colecionáveis, cheats, 100% e localizações do **Modo História**. Tente citar o nome da missão, personagem ou item.",
    en: "I can help with missions, heists, characters, collectibles, cheats, 100% completion and locations in **Story Mode**. Try naming the mission, character or item.",
  },
  online: {
    pt: "Isso pertence ao GTA Online, não ao Modo História.",
    en: "That belongs to GTA Online, not Story Mode.",
  },
  spoiler: { pt: "⚠️ Spoiler de história", en: "⚠️ Story spoiler" },
  demoBanner: {
    pt: "🧪 **MODO DEMO** — provedor de IA não configurado (*AI provider not configured*). Esta resposta é montada diretamente da base de conhecimento, sem modelo de linguagem.",
    en: "🧪 **DEMO MODE** — AI provider not configured. This answer is assembled directly from the knowledge base, without a language model.",
  },
  approxNote: {
    pt: "A posição no mapa é aproximada (mapa esquemático do projeto).",
    en: "The map position is approximate (the project's schematic map).",
  },
  askVersion: {
    pt: "❓ Essa informação pode variar por versão. Qual você joga? (PS3/360 · PS4/One · PS5/Series · PC Legacy/Enhanced)",
    en: "❓ This can differ by version. Which one do you play? (PS3/360 · PS4/One · PS5/Series · PC Legacy/Enhanced)",
  },
  versionTitle: { pt: "Depende da versão", en: "Version-dependent" },
  backlogPrefix: { pt: "Pendência registrada", en: "Logged as a gap" },
} satisfies Record<string, Bi<string>>;

const FN = {
  onlineBody: {
    pt: (name: string) => `**${name}** existe apenas no GTA Online e não faz parte do Modo História, então não vou misturar as informações. Se quiser, pergunte sobre o equivalente ou o conteúdo do Modo História.`,
    en: (name: string) => `**${name}** only exists in GTA Online and is not part of Story Mode, so I won't mix the two. Feel free to ask about the Story Mode equivalent instead.`,
  },
  locationLine: {
    pt: (name: string, where: string) => `📍 **${name}** fica em ${where}.`,
    en: (name: string, where: string) => `📍 **${name}** is in ${where}.`,
  },
} satisfies Record<string, Bi<(...args: never[]) => string>>;

export function t(key: keyof typeof TEXT, lang: Lang): string {
  return TEXT[key][lang];
}

export function tf<K extends keyof typeof FN>(key: K, lang: Lang): (typeof FN)[K]["pt"] {
  return FN[key][lang] as (typeof FN)[K]["pt"];
}
