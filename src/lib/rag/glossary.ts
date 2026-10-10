import { normalize } from "@/lib/text";

/**
 * Small PT→EN domain glossary. The knowledge base is authored in English (mission names and
 * wiki terminology are English), while users often ask in Portuguese. The glossary appends the
 * English equivalents to a query so keyword search and the local embedder can bridge the gap.
 * Real multilingual embedding providers (OpenAI/Google) do not need it, but it never hurts.
 */
const GLOSSARY: Array<[RegExp, string]> = [
  [/\b(ganha|ganhar|ganho|ganhos|rende|rendimento|paga|pagar|pagamento|lucro|lucrar)\b/, "earn payout take profit money revenue yields"],
  [/\barremess\w*\b/, "throwables projectiles grenade molotov sticky bomb"],
  [/\b(trava|travar|travamento|trancou)\b/, "crash freezes technical problem launch"],
  [/\binvenc\w*\b/, "invincibility"],
  [/\bsuper pulo\b/, "super jump"],
  [/\b(telefone|celular)\b/, "phone number"],
  [/\bpeiote\b/, "peyote"],
  [/\bmiss(ao|oes)\b/, "mission"],
  [/\b(liberar|desbloque\w*|destrav\w*|libera)\b/, "unlock requirements"],
  [/\b(requisit\w*|pre-?requisit\w*|preciso)\b/, "requirements"],
  [/\bjoalheria\b/, "jewel store jewelry vangelico"],
  [/\b(arma|armas)\b/, "weapon"],
  [/\b(veiculo|veiculos|carro|carros)\b/, "vehicle car"],
  [/\b(moto|motos|motocicleta)\b/, "motorcycle"],
  [/\b(aviao|avioes)\b/, "plane aircraft"],
  [/\b(helicoptero|helicopteros)\b/, "helicopter"],
  [/\b(barco|barcos|lancha)\b/, "boat"],
  [/\b(localizacao|localizar|local|lugar)\b/, "location"],
  [/\bonde (fica|esta|encontr\w*|acho|achar|consigo)\b/, "where location"],
  [/\brecompensa\w*\b/, "reward"],
  [/\b(dinheiro|grana|ganhar dinheiro)\b/, "money cash"],
  [/\b(final|finais|desfecho)\b/, "ending"],
  [/\b(trofeu|trofeus|conquista|conquistas)\b/, "achievement trophy"],
  [/\bcoletave\w*|colecionave\w*\b/, "collectible"],
  [/\bmapa\b/, "map"],
  [/\b(imagem|imagens|foto|fotos)\b/, "image"],
  [/\b(truque|truques|codigo|codigos)\b/, "cheat code"],
  [/\b(acoes|bolsa|mercado de acoes|investir)\b/, "stock market bawsaq lcn"],
  [/\b(porcentagem|completar tudo|cem por cento)\b/, "100 percent completion"],
  [/\b(assalto|assaltos)\b/, "heist"],
  [/\b(contracts?|contratos?|assassinatos?)\b/, "assassinations assassination"],
  [/\b(ordem|sequencia)\b/, "order"],
  [/\b(pratic\w*)\b/, "practical"],
  [/\b(plano|roteiro)\b/, "plan"],
  [/\b(namorad\w*)\b/, "girlfriend boyfriend booty call"],
  [/\b(fantasma)\b/, "ghost"],
  [/\b(disco voador|ovni)\b/, "ufo"],
  [/\b(colecionave\w*|coletave\w*)\b/, "collectible"],
  [/\b(pecas? de nave|nave espacial)\b/, "spaceship parts"],
  [/\b(lixo nuclear|barris?)\b/, "nuclear waste"],
  [/\b(saltos? de paraquedas|paraquedas)\b/, "parachute jumps"],
  [/\b(equipe|tripulacao|comparsas?)\b/, "crew"],
  [/\babordagem\b/, "approach"],
  [/\bsutil\b/, "subtle smart stealth"],
  [/\bobvio\b/, "obvious loud"],
  [/\b(perder|perdi|perco|perdivel)\b/, "missable"],
  [/\bpersonagem\b/, "character"],
  [/\b(casa|casas|imovel|imoveis)\b/, "property house safehouse"],
  [/\b(propriedade|propriedades)\b/, "property"],
  [/\batividade\w*\b/, "activity"],
  [/\bevento aleatorio\b/, "random event"],
  [/\b(estranhos e aberracoes|estranhos)\b/, "strangers and freaks"],
  [/\b(pecas)\b/, "parts pieces"],
  [/\b(nave|disco voador)\b/, "spaceship ufo"],
  [/\bsubmarino\b/, "submarine kraken"],
  [/\b(problema|bug|travou|travando|nao aparece|nao aparecem|nao consigo|nao liga|nao inicia)\b/, "troubleshooting problem not appearing"],
  [/\b(melhor|melhores)\b/, "best"],
  [/\b(rapido|velocidade)\b/, "fastest speed"],
  [/\b(espingarda)\b/, "shotgun"],
  [/\b(pistola)\b/, "pistol"],
  [/\b(fuzil|rifle)\b/, "rifle"],
  [/\b(trapaca|trapacas)\b/, "cheat"],
  [/\b(historia|enredo)\b/, "story"],
  [/\b(morrer|morte)\b/, "death"],
  [/\b(versao|versoes|plataforma)\b/, "version platform"],
  [/\b(pc|computador)\b/, "pc"],
];

/**
 * Canonical phrase lexicon: Portuguese / community wording → the English phrase the knowledge base uses for the same
 * thing (its entity names and aliases). Unlike GLOSSARY (which appends search terms), these REPLACE the phrase, so the
 * canonical text can be run through alias-based entity extraction ("cartinhas" → "letter scraps" → the category).
 * Ordered longest-first; each pattern is matched on whole words of the normalised text.
 */
const CANONICAL: Array<[RegExp, string]> = [
  // Chat abbreviations ("q missão libera…", "cadê as peças", "vc", "oq").
  [/\b(oq|o q)\b/g, "o que"],
  [/\bq\b/g, "que"],
  [/\b(cade|kd)\b/g, "onde"],
  [/\b(vc|vcs)\b/g, "voce"],
  [/\b(tb|tbm)\b/g, "tambem"],
  [/\b(pq)\b/g, "porque"],
  [/\b(cartas rasgadas|pedacos de cartas?|fragmentos de cartas?|cartas)\b/g, "letter scraps"],
  [/\b(carta rasgada|pedaco de carta|fragmento de carta|carta)\b/g, "letter scrap"],
  [/\b(pecas? da nave espacial|pecas? de nave espacial|pecas? da nave|pecas? de nave|partes? da nave|naves? espacia(l|is))\b/g, "spaceship parts"],
  [/\b(pecas? do submarino|pecas? de submarino)\b/g, "submarine pieces"],
  [/\b(lixo nuclear|lixo radioativo|lixos? toxicos?|barris (de lixo|radioativos|nucleares))\b/g, "nuclear waste"],
  [/\b(pacotes? escondidos?)\b/g, "hidden packages"],
  [/\b(saltos? de paraquedas)\b/g, "parachute jumps"],
  [/\b(saltos? acrobaticos?|saltos? de manobra|saltos? com carro)\b/g, "stunt jumps"],
  [/\b(voos? de faca|voos? da faca|voos? rasantes?)\b/g, "knife flights"],
  [/\b(debaixo das? pontes?|embaixo das? pontes?|sob as? pontes?|por baixo das? pontes?)\b/g, "under the bridge"],
  [/\b(mosaicos? de macaco)\b/g, "monkey mosaics"],
  [/\b(folhetos? epsilon|tratados? epsilon|panfletos? epsilon)\b/g, "epsilon tracts"],
  [/\b(plantas? de peiote|peiotes?)\b/g, "peyote plants"],
  [/\b(eventos? aleatorios?)\b/g, "random events"],
  [/\b(estranhos e (aberracoes|malucos|esquisitos))\b/g, "strangers and freaks"],
  [/\b((golpe|assalto) (da|na|a) joalheria)\b/g, "jewel store job"],
  [/\b(discos? voador(es)?|ovnis?)\b/g, "ufo"],
  [/\b(fantasmas?)\b/g, "ghost"],
  [/\b(pe grande)\b/g, "bigfoot"],
  [/\b(alienigenas?|extraterrestres?)\b/g, "alien"],
  [/\b(zumbis?)\b/g, "zombie"],
  [/\b(dragao|dragoes)\b/g, "dragon"],
  [/\b(clube de strip|boate de strip|casa de strip)\b/g, "strip club"],
  [/\b(dancarinas?|strippers)\b/g, "stripper"],
  [/\b(apartamentos?)\b/g, "apartment"],
  [/\b(tanque de guerra)\b/g, "tank"],
  [/\b(cem por cento)\b/g, "100"],
];

/** Domain words the canonical lexicon produces ("ufo", "ghost"…): short ones are still meaningful as name words. */
export const CANONICAL_TERMS = new Set(["ufo", "ghost", "alien", "zombie", "dragon", "tank", "bigfoot"]);

const LEXICON = [...CANONICAL, ...GLOSSARY].map(([re]) => new RegExp(re.source));
const inLexicon = (word: string) => LEXICON.some((re) => re.test(word));

/**
 * Portuguese diminutives of lexicon words: "cartinhas" → "cartas", "fantasminha" → "fantasma", "pecinhas" → "pecas".
 * A word is reduced only when the reduced form is a lexicon word and the word itself is not, so words that merely end
 * like a diminutive ("caminho", "sozinho", "vizinho") are left as they are.
 */
function deDiminutive(word: string): string {
  const m = word.match(/^(.{3,}?)(zinh|inh)(a|o)(s?)$/);
  if (!m) return word;
  const reduced = m[2] === "zinh" ? `${m[1]}${m[4]}` : `${m[1]}${m[3]}${m[4]}`;
  return inLexicon(reduced) && !inLexicon(word) ? reduced : word;
}

/**
 * Normalised question with community / Portuguese wording replaced by the knowledge base's canonical English phrases.
 * Used for entity extraction and intent classification alongside the original wording; English text passes unchanged.
 */
export function canonicalizeQuery(text: string): string {
  let n = normalize(text).split(" ").map(deDiminutive).join(" ");
  for (const [re, en] of CANONICAL) n = n.replace(re, en);
  return n.replace(/\s+/g, " ").trim();
}

/** Returns the original text plus appended English glossary terms (deduplicated). */
export function expandQuery(text: string): string {
  const n = normalize(text);
  const extra = new Set<string>();
  // The canonical rewrite contributes its English words too ("cartinhas" → "letter scraps").
  for (const w of canonicalizeQuery(text).split(" ")) if (!n.includes(w)) extra.add(w);
  for (const [re, en] of GLOSSARY) if (re.test(n)) en.split(" ").forEach((w) => extra.add(w));
  const present = new Set(n.split(" "));
  const add = [...extra].filter((w) => !present.has(w));
  return add.length ? `${text} ${add.join(" ")}` : text;
}
