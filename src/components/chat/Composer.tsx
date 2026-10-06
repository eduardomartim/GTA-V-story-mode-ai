"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";

export const MAX_LENGTH = 600;

/** Subscribes to a CSS media query without effects/state churn (SSR-safe: server snapshot is `false`). */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export interface ComposerHandle {
  focus: () => void;
}

export const Composer = forwardRef<ComposerHandle, { disabled: boolean; onSend: (text: string) => void }>(function Composer({ disabled, onSend }, ref) {
  const [value, setValue] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const wide = useMediaQuery("(min-width: 480px)");
  useImperativeHandle(ref, () => ({ focus: () => area.current?.focus() }));

  const resize = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);
  useEffect(resize, [value, resize]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      className="flex items-end gap-2 rounded-2xl border border-line bg-panel/95 p-2 shadow-[0_8px_30px_rgba(0,0,0,.45)] transition focus-within:border-ember/60"
    >
      <label htmlFor="composer" className="sr-only">Ask anything about GTA V Story Mode</label>
      <textarea
        id="composer"
        ref={area}
        rows={1}
        value={value}
        maxLength={MAX_LENGTH}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
        }}
        placeholder={wide ? "Ask anything about GTA V Story Mode…" : "Ask about GTA V Story Mode…"}
        className="max-h-[150px] min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[0.95rem] text-bone outline-none placeholder:text-mute/70 focus-visible:outline-none"
        autoComplete="off"
        spellCheck
      />
      {value.length > MAX_LENGTH - 100 ? (
        <span className="pb-2.5 text-[0.68rem] tabular-nums text-mute" aria-live="polite">{value.length}/{MAX_LENGTH}</span>
      ) : null}
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send message"
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-ember text-ink transition hover:bg-[#ff9f55] disabled:cursor-not-allowed disabled:bg-raise disabled:text-mute"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </form>
  );
});
