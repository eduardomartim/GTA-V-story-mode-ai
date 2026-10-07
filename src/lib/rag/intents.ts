import { normalize } from "@/lib/text";
import type { EntityRef, Intent } from "./types";

/**
 * Cheap, deterministic, multi-label intent classifier (no LLM call). Questions often carry several
 * intents ("where is it and what do I get?"), so every matching intent is returned, strongest first,
 * and retrieval pulls from all of the corresponding domains.
 */
const RULES: Array<[Intent, RegExp, number]> = [
  ["mission_unlock", /\b(unlock|liberar|libera|liberou|desbloque\w*|destrav\w*|trigger|appear|aparec\w*|how to start|como (iniciar|comecar)|start the mission|vem depois|depois de|comes after|next mission|proxima missao|what follows)\b/, 2],
  ["mission_walkthrough", /\b(walkthrough|passo a passo|guia|guide|tutorial|como (faco|fazer|completo|completar|passar|zerar)|how (do i|to|can i) (do|complete|beat|finish|pass|play))\b/, 2],
  ["mission_requirements", /\b(requisit\w*|requirement\w*|pre-?requisit\w*|preciso (fazer|ter)|what do i need|need to do|o que preciso)\b/, 2],
  ["mission_reward", /\b(recompensa\w*|rewards?|payout|medal|medalha|gold medal|tempo de ouro|ouro|quanto (rende|paga|ganho|dinheiro)|how much|(most|max\w*) .* (get|earn|make)|can (get|earn|make)|cut)\b/, 2],
  ["heist_strategy", /\b(heists?|assaltos?|abordagem|approach(es)?|subtle|obvious|smart|loud|sutil|obvio|crew|equipe|tripulacao|gunman|hacker|driver|estrategia|strategy|golpe)\b/, 2],
  ["character_information", /\b(quem (e|eh|foi|sao)|who (is|was|are)|personagens?|characters?|bio|biografia|protagonistas?)\b/, 1.5],
  ["vehicle_information", /\b(veiculos?|vehicles?|duster|phantom|carros?|cars?|motos?|motorcycles?|avioes|aviao|planes?|helic\w*|boats?|barcos?|rapido|fastest|docker|buzzard|tank|tanque)\b/, 2],
  ["weapon_information", /\b(armas?|weapons?|guns?|pistol\w*|rifles?|fuzil|sniper|shotguns?|espingarda|minigun|rpg|smg|railgun)\b/, 2],
  ["location_lookup", /\b(onde (fica|esta|ficam|encontr\w*|acho|achar|consigo|tem|acontece|comeca|e que)|where (is|are|can i|do i|to|does|did)|em que local|qual (e )?o local|localiz\w*|location|como chegar|how to get to|takes? place|start(s)? (at|in))\b/, 2],
  ["collectible_lookup", /\b(colecion\w*|coletav\w*|collectibles?|letter scraps?|spaceship parts?|submarine (pieces|parts)?|nuclear waste|peyote|peiote|monkey mosaics?|epsilon|stunt jumps?|knife flights?|pecas|parts|hidden packages?|pacotes)\b/, 2],
  ["100_percent_completion", /\b(100|100 percent|cem por cento|completion|completar (o jogo|tudo)|career criminal|quanto falta)\b/, 2.5],
  ["random_event", /\b(random events?|eventos? aleatorios?)\b/, 2.5],
  ["activity", /\b(atividades?|activit\w*|hobb\w*|golf|tennis|darts|triathlon|yoga|strangers|estranhos|freaks|passatempos)\b/, 2],
  ["property", /\b(propriedades?|propert\w*|safehouses?|imove\w*|casas?|houses?|comprar|buy)\b/, 1.5],
  ["money", /\b(dinheiro|money|cash|grana|milhoes|million|rico|rich|ganhar|lucro|earn)\b/, 2],
  ["stock_market", /\b(acoes|mercado de acoes|stock\w*|bawsaq|lcn|bolsa|invest\w*)\b/, 3],
  ["ending", /\b(finais|final|endings?|deathwish|the third way|qual final|spoilers?)\b/, 2],
  ["cheat", /\b(cheats?|truques?|codigos?|trapacas?|codes?)\b/, 2.5],
  ["easter_egg", /\b(easter eggs?|segredos?|secrets?|mystery|misterio|misterios|fantasmas?|ghosts?|ufos?|ovnis?|disco voador|alien\w*|bigfoot|pe grande)\b/, 2.5],
  ["troubleshooting", /\b(nao (aparec\w*|consigo|liga|inicia|funciona|abre|encontr\w*|aparece)|bug\w*|travou|travando|trava|travar|crash\w*|problem\w*|not (showing|appearing|working|available|starting)|can'?t|cant|cannot|wont|won'?t (start|work|appear|load)|missing|resolver|fix|stuck|erro|error|nao liga|did(n'?t| not) (appear|start|show))\b/, 2.5],
  ["version_difference", /\b(versao|versoes|version\w*|ps3|ps4|ps5|xbox|enhanced|legacy|plataformas?|platforms?|diferenca\w*|differen\w*|next-?gen)\b/, 2],
  ["map_request", /\b(mapa|map|marcador|marker|no mapa|on the map)\b/, 2.5],
  ["image_request", /\b(imagens?|images?|fotos?|pictures?|screenshots?|mostre (uma )?imagem|show (me )?(an? )?(image|picture))\b/, 2.5],
  ["mission_help", /\b(missao|missoes|mission|missions|como faco|how to|how do i)\b/, 1],
];

const TYPE_TO_INTENT: Partial<Record<EntityRef["type"], Intent>> = {
  mission: "mission_help", heist: "heist_strategy", character: "character_information", vehicle: "vehicle_information",
  weapon: "weapon_information", location: "location_lookup", collectible: "collectible_lookup", cheat: "cheat",
  ending: "ending", stock: "stock_market", completion: "100_percent_completion", random_event: "random_event",
  activity: "activity", hobby: "activity", property: "property", easter_egg: "easter_egg", troubleshooting: "troubleshooting", version: "version_difference",
};

export function classifyIntents(query: string, entities: EntityRef[]): Intent[] {
  const n = normalize(query);
  const scores = new Map<Intent, number>();
  for (const [intent, re, w] of RULES) if (re.test(n)) scores.set(intent, (scores.get(intent) ?? 0) + w);

  // Entity types hint at intent when the wording is vague ("Jewel Store Job?").
  for (const e of entities.slice(0, 3)) {
    const hint = TYPE_TO_INTENT[e.type];
    if (hint && !scores.has(hint)) scores.set(hint, 0.8);
  }
  // A concrete mission/heist entity makes generic "how to" a walkthrough question.
  if (scores.has("mission_help") && entities.some((e) => e.type === "mission" || e.type === "heist")) scores.set("mission_walkthrough", (scores.get("mission_walkthrough") ?? 0) + 1.5);

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([i]) => i);
  const top = ranked.slice(0, 4);
  return top.length ? top : ["general_question"];
}

export const SPOILER_REQUEST = /\b(spoilers?|com spoiler|pode (dar|ter) spoiler|spoil it)\b/;
export const FOLLOW_UP_MARKERS =
  /\b(essa|esse|esta|este|dessa|desse|nessa|nesse|dela|dele|ela|ele|isso|aquela|aquele|there|that|this|it|its|them|those|same|e (qual|quais|onde|como|quanto|quem|quando|por que)|and (what|where|how|which|who|when)|what about|e a|e o)\b/;
