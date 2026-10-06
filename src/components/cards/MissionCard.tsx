import type { CardData, Lang } from "@/lib/rag/types";
import { ui } from "@/lib/ui/text";
import { Badge, CardShell, Fact, Facts, Summary } from "./CardShell";

type Props = { card: Extract<CardData, { kind: "mission" }>; lang: Lang };

const TYPE_LABEL: Record<string, string> = {
  heist: "Heist", heist_finale: "Heist · finale", heist_setup: "Heist setup", assassination: "Lester assassination",
  prologue: "Prologue", ending: "Ending", main: "Story mission", stranger: "Stranger", side: "Side",
};

export function MissionCard({ card, lang }: Props) {
  const isHeist = card.missionType.startsWith("heist") && card.missionType !== "heist_setup";
  return (
    <CardShell label={card.missionType === "heist" ? ui("heist", lang) : `${isHeist ? ui("heist", lang) : ui("mission", lang)} · ${TYPE_LABEL[card.missionType] ?? card.missionType}`} title={card.name}>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Badge tone="ember">{ui("storyMode", lang)}</Badge>
        {card.spoilerLevel >= 2 ? <Badge tone="danger">⚠️ {ui("spoiler", lang)}</Badge> : null}
      </div>
      <Facts>
        {card.protagonists.length ? <Fact k={ui("playedBy", lang)} v={card.protagonists.join(", ")} /> : null}
        {card.giver ? <Fact k={ui("giver", lang)} v={card.giver} /> : null}
        {card.sequence ? <Fact k={ui("order", lang)} v={`#${card.sequence}`} /> : null}
        {card.approaches?.length ? <Fact k={ui("approaches", lang)} v={card.approaches.join(" / ")} /> : null}
        {card.location ? <Fact k={ui("where", lang)} v={`📍 ${card.location.name}`} /> : null}
      </Facts>
      <Summary text={card.summary} />
    </CardShell>
  );
}
