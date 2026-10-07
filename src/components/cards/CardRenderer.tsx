import type { CardData, Lang } from "@/lib/rag/types";
import { CharacterCard, CollectibleCard, VehicleCard, WeaponCard } from "./EntityCards";
import { LocationCard, MapCard } from "./LocationCards";
import { CompletionCard, ItemsCard, RelatedCard, RelationshipCard } from "./KnowledgeCards";
import { ImageCard, StepsCard, WarningCard } from "./MessageCards";
import { MissionCard } from "./MissionCard";

export function CardRenderer({ card, lang, onAsk }: { card: CardData; lang: Lang; onAsk?: (q: string) => void }) {
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
    case "items": return <ItemsCard card={card} lang={lang} />;
    case "relationship": return <RelationshipCard card={card} lang={lang} />;
    case "completion": return <CompletionCard card={card} lang={lang} />;
    case "related": return <RelatedCard card={card} lang={lang} onAsk={onAsk} />;
    case "spoiler": return null; // rendered as a badge above the message (SpoilerCard)
  }
}

export function CardGrid({ cards, lang, onAsk }: { cards: CardData[]; lang: Lang; onAsk?: (q: string) => void }) {
  const visible = cards.filter((c) => c.kind !== "spoiler");
  if (!visible.length) return null;
  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2" data-testid="cards">
      {visible.map((c, i) => (
        <CardRenderer key={`${c.kind}-${"entityId" in c ? c.entityId : i}-${i}`} card={c} lang={lang} onAsk={onAsk} />
      ))}
    </div>
  );
}
