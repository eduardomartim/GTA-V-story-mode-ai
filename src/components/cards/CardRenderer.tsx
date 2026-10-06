import type { CardData, Lang } from "@/lib/rag/types";
import { CharacterCard, CollectibleCard, VehicleCard, WeaponCard } from "./EntityCards";
import { LocationCard, MapCard } from "./LocationCards";
import { ImageCard, StepsCard, WarningCard } from "./MessageCards";
import { MissionCard } from "./MissionCard";

export function CardRenderer({ card, lang }: { card: CardData; lang: Lang }) {
  switch (card.kind) {
    case "mission": return <MissionCard card={card} lang={lang} />;
    case "character": return <CharacterCard card={card} lang={lang} />;
    case "vehicle": return <VehicleCard card={card} lang={lang} />;
    case "weapon": return <WeaponCard card={card} lang={lang} />;
    case "collectible": return <CollectibleCard card={card} lang={lang} />;
    case "location": return <LocationCard card={card} lang={lang} />;
    case "map": return <MapCard card={card} lang={lang} />;
    case "image": return <ImageCard card={card} lang={lang} />;
    case "warning": return <WarningCard card={card} />;
    case "steps": return <StepsCard card={card} />;
    case "spoiler": return null; // rendered as a badge above the message (SpoilerCard)
  }
}

export function CardGrid({ cards, lang }: { cards: CardData[]; lang: Lang }) {
  const visible = cards.filter((c) => c.kind !== "spoiler");
  if (!visible.length) return null;
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2" data-testid="cards">
      {visible.map((c, i) => (
        <CardRenderer key={`${c.kind}-${"entityId" in c ? c.entityId : i}-${i}`} card={c} lang={lang} />
      ))}
    </div>
  );
}
