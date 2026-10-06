import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function CardShell({ label, title, accent = "ember", children, actions, className }: {
  label: string;
  title: string;
  accent?: "ember" | "tide" | "danger" | "mute";
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const bar = { ember: "bg-ember", tide: "bg-tide", danger: "bg-danger", mute: "bg-mute" }[accent];
  return (
    <article className={cn("relative min-w-0 overflow-hidden rounded-xl border border-line bg-panel/90 p-3.5 pl-4 shadow-[0_1px_0_rgba(255,255,255,.03)_inset]", className)}>
      <span className={cn("absolute inset-y-0 left-0 w-1", bar)} aria-hidden="true" />
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{label}</p>
      <h3 className="mt-0.5 font-display text-[1.35rem] leading-tight tracking-wide text-bone">{title}</h3>
      {children}
      {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
    </article>
  );
}

export function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] uppercase tracking-wider text-mute">{k}</dt>
      <dd className="line-clamp-2 break-words text-sm text-bone" title={typeof v === "string" ? v : undefined}>{v}</dd>
    </div>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">{children}</dl>;
}

export function Badge({ children, tone = "mute" }: { children: ReactNode; tone?: "mute" | "ember" | "tide" | "danger" }) {
  const t = { mute: "border-line text-mute", ember: "border-ember/40 text-ember", tide: "border-tide/40 text-tide", danger: "border-danger/40 text-danger" }[tone];
  return <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.68rem] font-medium", t)}>{children}</span>;
}

export const linkBtn =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-line bg-raise px-2.5 py-1 text-xs font-medium text-bone transition hover:border-ember/60 hover:text-ember focus-visible:border-ember";

export function Summary({ text }: { text: string }) {
  return <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-mute">{text}</p>;
}
