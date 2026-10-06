import { afterEach } from "vitest";

// Runs before every test file, before any application module reads process.env.
process.env.PGLITE_DIR = "memory://";
for (const k of ["DATABASE_URL", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "AI_PROVIDER", "API_ACCESS_KEY", "DEBUG_MODE"]) delete process.env[k];
process.env.EMBEDDING_PROVIDER = "local";
process.env.RATE_LIMIT_PER_MINUTE = "500";

if (typeof window !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => cleanup());
  // jsdom has no <dialog> modal support or layout APIs.
  const proto = window.HTMLDialogElement?.prototype;
  if (proto) {
    proto.showModal = function showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); };
    proto.close = function close(this: HTMLDialogElement) { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  }
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.scrollTo = (() => {}) as typeof window.HTMLElement.prototype.scrollTo;
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
}
