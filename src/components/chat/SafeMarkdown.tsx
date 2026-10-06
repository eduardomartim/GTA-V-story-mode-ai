"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSafeExternalUrl } from "@/lib/security/url";

/**
 * Safe Markdown: raw HTML is NOT rendered (react-markdown escapes it), unsafe URL protocols are dropped by the
 * default URL transform, remote images are never loaded, and external links must be on the allow-list.
 * `[n](#source-n)` links (produced by the citation resolver) become accessible citation chips.
 */
export function SafeMarkdown({ text, messageId }: { text: string; messageId: string }) {
  const components: Components = {
    a({ href, children }) {
      const cite = href?.match(/^#source-(\d+)$/);
      if (cite) {
        const n = cite[1];
        return (
          <button
            type="button"
            aria-label={`Source ${n}`}
            className="mx-0.5 inline-grid h-[1.15rem] min-w-[1.15rem] -translate-y-0.5 place-items-center rounded-md border border-ember/40 bg-ember/10 px-1 align-middle text-[0.68rem] font-bold leading-none text-ember transition hover:bg-ember/25"
            onClick={() => {
              const el = document.getElementById(`${messageId}-source-${n}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.querySelector<HTMLElement>("a,div")?.focus?.();
            }}
          >
            {children}
          </button>
        );
      }
      if (href && isSafeExternalUrl(href)) {
        return <a className="ext" href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      }
      return <span>{children}</span>;
    },
    img: ({ alt }) => <span className="text-mute">{alt ? `[${alt}]` : ""}</span>,
  };
  return (
    <div className="prose-gta" data-testid="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{text}</ReactMarkdown>
    </div>
  );
}
