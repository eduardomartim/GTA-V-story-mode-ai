import type { Lang } from "@/lib/rag/types";

const D = {
  mission: { pt: "Missão", en: "Mission" },
  heist: { pt: "Heist", en: "Heist" },
  character: { pt: "Personagem", en: "Character" },
  vehicle: { pt: "Veículo", en: "Vehicle" },
  weapon: { pt: "Arma", en: "Weapon" },
  collectible: { pt: "Colecionável", en: "Collectible" },
  location: { pt: "Local", en: "Location" },
  map: { pt: "Mapa", en: "Map" },
  playedBy: { pt: "Personagens", en: "Characters" },
  giver: { pt: "Quem passa", en: "Giver" },
  order: { pt: "Ordem na história", en: "Story order" },
  approaches: { pt: "Abordagens", en: "Approaches" },
  where: { pt: "Local", en: "Place" },
  ability: { pt: "Habilidade", en: "Ability" },
  role: { pt: "Papel", en: "Role" },
  howToGet: { pt: "Como obter", en: "How to get it" },
  total: { pt: "Total", en: "Total" },
  reward: { pt: "Recompensa", en: "Reward" },
  openMap: { pt: "Abrir mapa", en: "Open map" },
  expand: { pt: "Ampliar", en: "Enlarge" },
  howToGetThere: { pt: "Como chegar", en: "Directions" },
  approxPos: { pt: "Posição aproximada", en: "Approximate position" },
  schematic: { pt: "Mapa esquemático do projeto (não é o mapa oficial do jogo)", en: "Project schematic map (not the official in-game map)" },
  sources: { pt: "Fontes", en: "Sources" },
  verified: { pt: "verificado", en: "verified" },
  curated: { pt: "curado", en: "curated" },
  unverified: { pt: "não verificado", en: "unverified" },
  spoiler: { pt: "Spoiler de história", en: "Story spoiler" },
  close: { pt: "Fechar", en: "Close" },
  fromOrigin: { pt: "A partir de", en: "From" },
  straightLine: { pt: "em linha reta, aproximado", en: "straight line, approximate" },
  image: { pt: "Imagem", en: "Image" },
  externalImage: { pt: "Galeria externa (link)", en: "External gallery (link)" },
  license: { pt: "Licença", en: "License" },
  storyMode: { pt: "Modo História", en: "Story Mode" },
} satisfies Record<string, { pt: string; en: string }>;

export function ui(key: keyof typeof D, lang: Lang): string {
  return D[key][lang];
}

const DIRS = {
  pt: ["norte", "nordeste", "leste", "sudeste", "sul", "sudoeste", "oeste", "noroeste"],
  en: ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"],
};

/** Straight-line compass bearing/distance between two (approximate) game coordinates. y points north. */
export function bearing(fromX: number, fromY: number, toX: number, toY: number, lang: Lang): { km: number; dir: string } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return { km: Math.hypot(dx, dy) / 1000, dir: DIRS[lang][idx] as string };
}

export const ORIGINS = [
  { id: "michael", name: { pt: "Casa do Michael", en: "Michael's house" }, x: -813, y: 178 },
  { id: "franklin", name: { pt: "Casa do Franklin (Strawberry)", en: "Franklin's house (Strawberry)" }, x: -14, y: -1442 },
  { id: "trevor", name: { pt: "Trailer do Trevor", en: "Trevor's trailer" }, x: 1975, y: 3815 },
] as const;
