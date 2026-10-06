import { normalize } from "@/lib/text";

/**
 * Small PT→EN domain glossary. The knowledge base is authored in English (mission names and
 * wiki terminology are English), while users often ask in Portuguese. The glossary appends the
 * English equivalents to a query so keyword search and the local embedder can bridge the gap.
 * Real multilingual embedding providers (OpenAI/Google) do not need it, but it never hurts.
 */
const GLOSSARY: Array<[RegExp, string]> = [
  [/\b(ganha|ganhar|ganho|ganhos|rende|rendimento|paga|pagar|pagamento|lucro|lucrar)\b/, "earn payout take profit money"],
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

/** Returns the original text plus appended English glossary terms (deduplicated). */
export function expandQuery(text: string): string {
  const n = normalize(text);
  const extra = new Set<string>();
  for (const [re, en] of GLOSSARY) if (re.test(n)) en.split(" ").forEach((w) => extra.add(w));
  const present = new Set(n.split(" "));
  const add = [...extra].filter((w) => !present.has(w));
  return add.length ? `${text} ${add.join(" ")}` : text;
}
