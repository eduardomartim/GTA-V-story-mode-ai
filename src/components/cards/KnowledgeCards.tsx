"use client";

import Link from "next/link";
import type { CardData, Lang } from "@/lib/rag/types";
import { Badge, CardShell, linkBtn } from "./CardShell";

type Items = Extract<CardData, { kind: "items" }>;
type Relationship = Extract<CardData, { kind: "relationship" }>;
type Completion = Extract<CardData, { kind: "completion" }>;

const L = {
  items: { pt: "Itens", en: "Items" },
  seeOnMap: { pt: "Ver no mapa", en: "See on map" },
  relationship: { pt: "Relacionamento", en: "Relationship" },
  protagonists: { pt: "Protagonistas", en: "Protagonists" },
  home: { pt: "Onde mora", en: "Home" },
  evidence: { pt: "Evidência (fonte)", en: "Evidence (source)" },
  completion: { pt: "Checklist 100%", en: "100% checklist" },
  required: { pt: "exigido", en: "required" },
  of: { pt: "de", en: "of" },
  more: { pt: "mais", en: "more" },
} satisfies Record<string, Record<Lang, string>>;

const PRECISION_TONE: Record<string, "tide" | "ember" | "mute"> = { verified: "tide", community: "tide", approximate: "ember", area: "mute" };
const PRECISION_TEXT: Record<string, Record<Lang, string>> = {
  verified: { pt: "verificada", en: "verified" },
  community: { pt: "coord. comunidade", en: "community coords" },
  approximate: { pt: "aproximada", en: "approximate" },
  area: { pt: "só a área", en: "area only" },
};

const CATEGORY: Record<string, Record<Lang, string>> = {
  missions: { pt: "Missões", en: "Missions" },
  strangers_and_freaks: { pt: "Strangers and Freaks", en: "Strangers and Freaks" },
  random_events: { pt: "Random Events", en: "Random Events" },
  hobbies_and_pastimes: { pt: "Hobbies e passatempos", en: "Hobbies and pastimes" },
  miscellaneous: { pt: "Diversos", en: "Miscellaneous" },
  not_required: { pt: "Não obrigatório", en: "Not required" },
};

export function ItemsCard({ card, lang }: { card: Items; lang: Lang }) {
  const shown = card.rows.slice(0, 12);
  return (
    <CardShell label={`🧩 ${L.items[lang]}`} title={card.title} accent="tide" className="sm:col-span-2"
      actions={card.rows[0] ? <Link className={linkBtn} href={`/map?focus=${encodeURIComponent(card.rows[0].id)}`}>🗺 {L.seeOnMap[lang]}</Link> : undefined}>
      {card.note ? <p className="mt-1.5 text-xs leading-snug text-mute">{card.note}</p> : null}
      <ol className="mt-2 grid gap-1.5">
        {shown.map((r) => (
          <li key={r.id} className="rounded-lg border border-line/70 bg-raise/50 px-2.5 py-1.5 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/map?focus=${encodeURIComponent(r.id)}`} className="font-medium text-bone hover:text-ember">{r.label}</Link>
              {r.distance !== undefined ? <span className="text-xs tabular-nums text-ember">{(r.distance / 1000).toFixed(2)} km</span> : null}
              <Badge tone={PRECISION_TONE[r.precision] ?? "mute"}>{PRECISION_TEXT[r.precision]?.[lang] ?? r.precision}</Badge>
            </div>
            {r.area ? <p className="text-xs text-mute">📍 {r.area}</p> : null}
            {r.detail ? <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-mute">{r.detail}</p> : null}
          </li>
        ))}
      </ol>
      {card.rows.length > shown.length ? <p className="mt-1.5 text-xs text-mute">+{card.rows.length - shown.length} {L.more[lang]}</p> : null}
    </CardShell>
  );
}

export function RelationshipCard({ card, lang }: { card: Relationship; lang: Lang }) {
  return (
    <CardShell label={`❤️ ${L.relationship[lang]}`} title={card.name} accent="danger"
      actions={<Link className={linkBtn} href={`/map?focus=${encodeURIComponent(card.entityId)}`}>🗺 {L.seeOnMap[lang]}</Link>}>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-xs uppercase tracking-wider text-mute">{L.protagonists[lang]}</dt><dd className="text-bone">👤 {card.protagonists.join(", ")}</dd>
        <dt className="text-xs uppercase tracking-wider text-mute">{L.relationship[lang]}</dt><dd className="text-bone">{card.relation}</dd>
        {card.home ? (<><dt className="text-xs uppercase tracking-wider text-mute">{L.home[lang]}</dt><dd className="text-bone">📍 {card.home}</dd></>) : null}
      </dl>
      <p className="mt-2 text-[0.7rem] uppercase tracking-wider text-mute">{L.evidence[lang]}</p>
      <blockquote className="mt-0.5 border-l-2 border-line pl-2 text-xs leading-snug text-mute">{card.evidence}</blockquote>
    </CardShell>
  );
}

export function CompletionCard({ card, lang }: { card: Completion; lang: Lang }) {
  return (
    <CardShell label={`✅ ${L.completion[lang]}`} title={card.protagonist ? `100% · ${card.protagonist}` : "100%"} accent="ember" className="sm:col-span-2">
      {card.note ? <p className="mt-1.5 text-xs leading-snug text-mute">{card.note}</p> : null}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {card.groups.map((g) => (
          <section key={g.category} className="rounded-lg border border-line/70 bg-raise/50 p-2">
            <h4 className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-ember">{CATEGORY[g.category]?.[lang] ?? g.category}</h4>
            <ul className="mt-1 grid gap-0.5">
              {g.items.slice(0, 12).map((i) => (
                <li key={i.label} className="text-xs leading-snug text-bone">
                  {i.label}
                  {i.required !== undefined ? <span className="ml-1 text-mute">({L.required[lang]}: {i.required}{i.total !== undefined ? ` ${L.of[lang]} ${i.total}` : ""})</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </CardShell>
  );
}

type Related = Extract<CardData, { kind: "related" }>;
const TYPE_LABEL: Record<string, Record<Lang, string>> = {
  mission: { pt: "Missões relacionadas", en: "Related missions" }, heist: { pt: "Missões relacionadas", en: "Related missions" },
  character: { pt: "Personagens relacionados", en: "Related characters" }, location: { pt: "Lugares", en: "Places" },
  random_event: { pt: "Atividades e eventos", en: "Activities & events" }, activity: { pt: "Atividades e eventos", en: "Activities & events" }, hobby: { pt: "Atividades e eventos", en: "Activities & events" },
  easter_egg: { pt: "Easter eggs", en: "Easter eggs" }, vehicle: { pt: "Veículos", en: "Vehicles" }, collectible: { pt: "Colecionáveis", en: "Collectibles" },
};

export function RelatedCard({ card, lang, onAsk }: { card: Related; lang: Lang; onAsk?: (q: string) => void }) {
  const groups = new Map<string, Related["items"]>();
  for (const i of card.items) {
    const label = TYPE_LABEL[i.type]?.[lang] ?? i.type;
    groups.set(label, [...(groups.get(label) ?? []), i]);
  }
  const ask = (name: string) => onAsk?.(lang === "pt" ? `Fale sobre ${name}` : `Tell me about ${name}`);
  return (
    <section className="sm:col-span-2 rounded-xl border border-line bg-panel/70 p-3" aria-label={lang === "pt" ? "Relacionados" : "Related"}>
      {[...groups].map(([label, items]) => (
        <div key={label} className="mt-1 first:mt-0">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {items.map((i) => (
              <button key={i.id} type="button" onClick={() => ask(i.name)} disabled={!onAsk}
                className="rounded-full border border-line bg-raise px-2.5 py-0.5 text-xs text-bone transition hover:border-ember/60 hover:text-ember disabled:cursor-default">
                {i.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
