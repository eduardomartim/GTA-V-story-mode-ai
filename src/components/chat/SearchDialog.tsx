"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { SearchGroup, SearchHit } from "@/lib/rag/search";

export function SearchDialog({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (hit: SearchHit) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const listId = useId();

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error("search failed");
        const json = (await res.json()) as { groups: SearchGroup[] };
        setGroups(json.groups);
        setState("idle");
      } catch (err) {
        if ((err as Error).name !== "AbortError") setState("error");
      }
    }, 180);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [q]);

  const shown = q.trim().length < 2 ? [] : groups;
  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(e) => e.target === dialog.current && onClose()}
      aria-label="Search the knowledge base"
      className="m-auto mt-[8vh] max-h-[80dvh] w-[min(94vw,620px)] overflow-hidden rounded-2xl border border-line bg-char p-0 text-bone shadow-2xl backdrop:bg-black/70 sm:mt-[12vh]"
    >
      <div className="flex items-center gap-2 border-b border-line px-3">
        <span aria-hidden="true" className="text-mute">⌕</span>
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search missions, characters, places, vehicles…"
          aria-label="Search"
          aria-controls={listId}
          className="h-12 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-mute/70"
          maxLength={80}
        />
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.65rem] text-mute sm:block">Esc</kbd>
      </div>
      <div id={listId} className="scroll-thin max-h-[58dvh] overflow-y-auto p-2" aria-live="polite">
        {state === "loading" ? <p className="px-2 py-3 text-sm text-mute">Searching…</p> : null}
        {state === "error" ? <p className="px-2 py-3 text-sm text-danger">Search is unavailable right now.</p> : null}
        {state === "idle" && q.trim().length >= 2 && shown.length === 0 ? <p className="px-2 py-3 text-sm text-mute">No Story Mode results for “{q.trim()}”.</p> : null}
        {shown.map((g) => (
          <section key={g.group} aria-label={g.group} className="mb-2">
            <h3 className="px-2 pb-1 pt-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-mute">{g.group}</h3>
            <ul>
              {g.hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onPick(h)} className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left transition hover:bg-raise focus-visible:bg-raise">
                    <span className="flex items-center gap-2 text-sm font-medium text-bone">{h.name}<span className="rounded border border-line px-1 py-px text-[0.6rem] font-semibold uppercase tracking-wider text-mute">{h.type.replace("_", " ")}</span></span>
                    <span className="line-clamp-1 text-xs text-mute">{h.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </dialog>
  );
}
