import type { EntityType } from "@/lib/kb/schema";
import type { FollowUp, Intent, Lang } from "./types";

interface Focus {
  id: string;
  type: EntityType;
  name: string;
}

/** A few contextual next questions (max 3). Labels are short; queries are self-contained. */
export function suggestFollowUps(focus: Focus | undefined, intents: Intent[], lang: Lang): FollowUp[] {
  if (!focus) return [];
  const pt = lang === "pt";
  const n = focus.name;
  const out: FollowUp[] = [];
  const add = (intent: Intent | null, label: [string, string], query: [string, string]) => {
    if (intent && intents.includes(intent)) return;
    out.push({ label: pt ? label[0] : label[1], query: pt ? query[0] : query[1] });
  };
  switch (focus.type) {
    case "mission":
    case "heist":
      add("mission_requirements", ["Ver requisitos", "See requirements"], [`Quais os requisitos para ${n}?`, `What are the requirements for ${n}?`]);
      add("location_lookup", ["Ver localização", "See location"], [`Onde fica ${n}?`, `Where is ${n}?`]);
      add("mission_reward", ["Ver recompensa", "See reward"], [`Qual a recompensa de ${n}?`, `What is the reward for ${n}?`]);
      add("mission_walkthrough", ["Ver walkthrough", "See walkthrough"], [`Como fazer ${n}?`, `How do I do ${n}?`]);
      break;
    case "location":
      add("map_request", ["Mostrar no mapa", "Show on map"], [`Mostre ${n} no mapa`, `Show ${n} on the map`]);
      add("image_request", ["Ver imagem", "See image"], [`Mostre uma imagem de ${n}`, `Show me an image of ${n}`]);
      break;
    case "character":
      add("mission_help", ["Ver missões", "See missions"], [`Quais são todas as missões de ${n}?`, `What are all the missions of ${n}?`]);
      add("location_lookup", ["Ver localização", "See location"], [`Onde fica a casa de ${n}?`, `Where does ${n} live?`]);
      break;
    case "collectible":
      add("location_lookup", ["Ver localização", "See location"], [`Onde encontrar ${n}?`, `Where to find ${n}?`]);
      add("mission_reward", ["Ver recompensa", "See reward"], [`Qual a recompensa de ${n}?`, `What is the reward for ${n}?`]);
      break;
    case "vehicle":
      add("location_lookup", ["Ver localização", "See location"], [`Onde encontrar ${n}?`, `Where to find ${n}?`]);
      add("mission_requirements", ["Como conseguir", "How to get it"], [`Como conseguir ${n}?`, `How do I get ${n}?`]);
      break;
    default:
      break;
  }
  return out.slice(0, 3);
}
