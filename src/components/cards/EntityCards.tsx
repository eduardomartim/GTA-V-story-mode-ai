import type { CardData, Lang } from "@/lib/rag/types";
import { ui } from "@/lib/ui/text";
import { Badge, CardShell, Fact, Facts, Summary } from "./CardShell";

export function CharacterCard({ card, lang }: { card: Extract<CardData, { kind: "character" }>; lang: Lang }) {
  return (
    <CardShell label={ui("character", lang)} title={card.name} accent="tide">
      <div className="mt-1.5 flex gap-1.5">{card.playable ? <Badge tone="tide">{lang === "pt" ? "Jogável" : "Playable"}</Badge> : null}</div>
      <Facts>
        {card.role ? <Fact k={ui("role", lang)} v={card.role} /> : null}
        {card.ability ? <Fact k={ui("ability", lang)} v={card.ability} /> : null}
      </Facts>
      <Summary text={card.summary} />
    </CardShell>
  );
}

export function VehicleCard({ card, lang }: { card: Extract<CardData, { kind: "vehicle" }>; lang: Lang }) {
  return (
    <CardShell label={`${ui("vehicle", lang)}${card.category ? ` · ${card.category}` : ""}`} title={card.name}>
      <div className="mt-1.5 flex gap-1.5">
        <Badge tone={card.storyMode ? "ember" : "danger"}>{card.storyMode ? ui("storyMode", lang) : "Online only"}</Badge>
      </div>
      <Facts>
        {card.manufacturer ? <Fact k="Manufacturer" v={card.manufacturer} /> : null}
        {card.howToGet ? <Fact k={ui("howToGet", lang)} v={card.howToGet} /> : null}
      </Facts>
      <Summary text={card.summary} />
    </CardShell>
  );
}

export function WeaponCard({ card, lang }: { card: Extract<CardData, { kind: "weapon" }>; lang: Lang }) {
  return (
    <CardShell label={`${ui("weapon", lang)}${card.category ? ` · ${card.category}` : ""}`} title={card.name}>
      <Summary text={card.summary} />
    </CardShell>
  );
}

export function CollectibleCard({ card, lang }: { card: Extract<CardData, { kind: "collectible" }>; lang: Lang }) {
  return (
    <CardShell label={ui("collectible", lang)} title={card.name} accent="tide">
      <Facts>
        {card.total !== undefined ? <Fact k={ui("total", lang)} v={String(card.total)} /> : null}
        {card.reward ? <Fact k={ui("reward", lang)} v={card.reward} /> : null}
        {card.versions.length ? <Fact k="Versions" v={card.versions.join(" · ")} /> : null}
      </Facts>
      <Summary text={card.summary} />
    </CardShell>
  );
}
