import type { CardData, Lang, SourceCardData } from "@/lib/rag/types";
import { cn } from "@/lib/cn";
import { safeUrl } from "@/lib/security/url";
import { ui } from "@/lib/ui/text";
import { Badge, CardShell, linkBtn } from "./CardShell";

export function WarningCard({ card }: { card: Extract<CardData, { kind: "warning" }> }) {
  const accent = card.tone === "online" ? "danger" : card.tone === "unvalidated" ? "mute" : "ember";
  const icon = card.tone === "online" ? "🛰️" : card.tone === "unvalidated" ? "🧩" : "ℹ️";
  return (
    <CardShell label={`${icon} Warning`} title={card.title} accent={accent}>
      <p className="mt-1.5 text-sm text-mute">{card.text}</p>
    </CardShell>
  );
}

export function SpoilerCard({ text }: { text: string }) {
  return (
    <div role="note" className="inline-flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1 text-xs font-semibold text-danger">
      {text}
    </div>
  );
}

export function StepsCard({ card }: { card: Extract<CardData, { kind: "steps" }> }) {
  return (
    <CardShell label="Steps" title={card.title}>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-bone marker:text-ember">
        {card.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </CardShell>
  );
}

export function ImageCard({ card, lang }: { card: Extract<CardData, { kind: "image" }>; lang: Lang }) {
  const external = card.isExternalLink;
  const href = external ? safeUrl(card.url) : undefined;
  // Only project-owned, same-origin asset paths may be used as <img src>.
  const localSrc = !external && /^\/[\w\-./]+$/.test(card.url) && !card.url.startsWith("//") ? card.url : undefined;
  return (
    <CardShell label={ui("image", lang)} title={card.title} accent="tide">
      {external || !localSrc ? (
        <p className="mt-1.5 text-sm text-mute">{ui("externalImage", lang)}</p>
      ) : (
        // Project-owned asset served from /public (never a remote hotlink).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={localSrc} alt={card.title} loading="lazy" className="mt-2 max-h-56 w-full rounded-lg border border-line object-contain" />
      )}
      <p className="mt-2 text-[0.7rem] leading-snug text-mute">
        {ui("license", lang)}: {card.license}
        {card.attribution ? ` · ${card.attribution}` : ""}
      </p>
      {href ? (
        <div className="mt-2">
          <a className={linkBtn} href={href} target="_blank" rel="noopener noreferrer">↗ {card.source}</a>
        </div>
      ) : null}
    </CardShell>
  );
}

export function SourceCard({ source, messageId, lang }: { source: SourceCardData; messageId: string; lang: Lang }) {
  const href = safeUrl(source.url);
  const tone = source.verification === "verified" ? "tide" : source.verification === "curated" ? "ember" : "danger";
  const body = (
    <>
      <span className="grid size-5 shrink-0 place-items-center rounded-md border border-line bg-raise text-[0.7rem] font-bold text-ember">{source.index}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8rem] font-medium text-bone">{source.sourceName}</span>
        <span className="block truncate text-[0.7rem] text-mute">{source.title}</span>
      </span>
      <Badge tone={tone}>{ui(source.verification as "verified" | "curated" | "unverified", lang)}</Badge>
    </>
  );
  const cls = cn("flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel/80 px-2.5 py-1.5 text-left transition", href && "hover:border-ember/60");
  return (
    <li id={`${messageId}-source-${source.index}`} className="min-w-0 scroll-mt-24">
      {href ? (
        <a className={cls} href={href} target="_blank" rel="noopener noreferrer" aria-label={`${source.sourceName} — ${source.title} (opens in a new tab)`}>{body}</a>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}
