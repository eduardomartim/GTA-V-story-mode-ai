export function TypingIndicator() {
  return (
    <div className="msg-in flex gap-3" role="status" aria-live="polite" aria-label="The assistant is searching the knowledge base">
      <span aria-hidden="true" className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-raise font-display text-lg leading-none text-ember">V</span>
      <div className="min-w-0 flex-1">
        <div className="dot-typing inline-flex items-center gap-1 rounded-full border border-line bg-panel/80 px-3 py-2" aria-hidden="true">
          <span className="size-1.5 rounded-full bg-ember" /><span className="size-1.5 rounded-full bg-ember" /><span className="size-1.5 rounded-full bg-ember" />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-hidden="true">
          <div className="shimmer h-24 rounded-xl border border-line" />
          <div className="shimmer hidden h-24 rounded-xl border border-line sm:block" />
        </div>
        <span className="sr-only">Searching the knowledge base…</span>
      </div>
    </div>
  );
}
