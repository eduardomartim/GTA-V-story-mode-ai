// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatApp } from "@/components/chat/ChatApp";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import type { ChatResult } from "@/lib/rag/types";

describe("SafeMarkdown (XSS and link safety)", () => {
  it("does not render raw HTML or scripts", () => {
    const { container } = render(<SafeMarkdown messageId="m" text={'Hello <script>window.__pwned=1</script><img src=x onerror="window.__pwned=1"> <b onclick="x()">bold</b>'} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[onclick]")).toBeNull();
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
  });
  it("drops javascript: links and non-allow-listed hosts (rendered as plain text)", () => {
    render(<SafeMarkdown messageId="m" text="[bad](javascript:alert(1)) and [evil](https://evil.example/x) and [ok](https://gta.fandom.com/wiki/X)" />);
    expect(screen.queryByRole("link", { name: "bad" })).toBeNull();
    expect(screen.queryByRole("link", { name: "evil" })).toBeNull();
    const ok = screen.getByRole("link", { name: "ok" });
    expect(ok).toHaveAttribute("rel", "noopener noreferrer");
    expect(ok).toHaveAttribute("target", "_blank");
  });
  it("never loads remote images", () => {
    const { container } = render(<SafeMarkdown messageId="m" text="![tracker](https://evil.example/pixel.png)" />);
    expect(container.querySelector("img")).toBeNull();
  });
  it("renders tables, lists and citation chips", () => {
    render(<SafeMarkdown messageId="m" text={"| a | b |\n|---|---|\n| 1 | 2 |\n\n1. one\n2. two\n\nFato [1](#source-1)"} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Source 1" })).toBeInTheDocument();
  });
});

const answer: ChatResult = {
  requestId: "r1", answer: "O **Big Score** tem duas abordagens [1](#source-1).", mode: "llm", lang: "pt", spoiler: true,
  cards: [{ kind: "mission", entityId: "heist:big-score", name: "The Big Score", missionType: "heist", protagonists: [], summary: "Final heist.", approaches: ["Subtle", "Obvious"], spoilerLevel: 2 }],
  sources: [{ index: 1, title: "The Big Score", sourceName: "GTA Wiki", sourceType: "wiki", url: "https://gta.fandom.com/wiki/The_Big_Score", confidence: 0.8, verification: "curated", entityId: "heist:big-score" }],
  followUps: [{ label: "Ver recompensa", query: "Qual a recompensa de The Big Score?" }],
  meta: { intents: ["heist_strategy"], entities: ["heist:big-score"], retrievalCount: 12, latencyMs: 321, provider: "openai", model: "m" },
};

const health = { ok: true, ai: { configured: true, provider: "openai", model: "m" }, embeddings: { model: "local-hash-384" }, database: { reachable: true, kind: "pglite", entities: 186, chunks: 209 } };

function mockFetch(chat: (body: Record<string, unknown>) => { status: number; json: unknown } | Promise<{ status: number; json: unknown }>) {
  const calls: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/health")) return new Response(JSON.stringify(health), { status: 200 });
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push(body);
    const r = await chat(body);
    return new Response(JSON.stringify(r.json), { status: r.status });
  }));
  return calls;
}

describe("ChatApp", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("shows the empty state with the five suggestions", async () => {
    mockFetch(() => ({ status: 200, json: answer }));
    render(<ChatApp />);
    expect(await screen.findByRole("heading", { level: 1, name: /GTA V STORY AI/i })).toBeInTheDocument();
    expect(screen.getByText("Your specialist for Los Santos.")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Suggested questions" })).getAllByRole("button")).toHaveLength(5);
    expect(screen.getAllByRole("textbox", { name: /Ask anything/ }).length).toBe(1);
  });

  it("sends a question, shows typing state, then answer + cards + sources + follow-ups", async () => {
    const calls = mockFetch(async () => { await new Promise((r) => setTimeout(r, 80)); return { status: 200, json: answer }; });
    render(<ChatApp />);
    const box = await screen.findByRole("textbox", { name: /Ask anything/ });
    fireEvent.change(box, { target: { value: "Como fazer The Big Score?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("status", { name: /searching/i })).toBeInTheDocument();
    expect(await screen.findByTestId("assistant-message")).toBeInTheDocument();
    expect(screen.getByText("Como fazer The Big Score?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Big Score" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /GTA Wiki — The Big Score/ })).toHaveAttribute("href", "https://gta.fandom.com/wiki/The_Big_Score");
    expect(screen.getByRole("note")).toHaveTextContent(/Spoiler de história/);
    expect(calls[0]).toMatchObject({ message: "Como fazer The Big Score?", allowSpoilers: false });

    // follow-up chip sends its own query and carries the entity context
    fireEvent.click(screen.getByRole("button", { name: "Ver recompensa" }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toMatchObject({ message: "Qual a recompensa de The Big Score?" });
    expect((calls[1]?.history as Array<{ entities?: string[] }>).some((h) => h.entities?.includes("heist:big-score"))).toBe(true);
  });

  it("sends on Enter, inserts a newline on Shift+Enter", async () => {
    const calls = mockFetch(() => ({ status: 200, json: answer }));
    render(<ChatApp />);
    const box = await screen.findByRole("textbox", { name: /Ask anything/ });
    fireEvent.change(box, { target: { value: "a" } });
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(calls).toHaveLength(0);
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(calls).toHaveLength(1));
  });

  it("shows a safe error state with Retry (no stack traces) and recovers", async () => {
    let n = 0;
    mockFetch(() => (++n === 1 ? { status: 503, json: { error: { code: "ai_unavailable", message: "O provedor de IA está indisponível agora. Tente novamente em instantes." } } } : { status: 200, json: answer }));
    render(<ChatApp />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Ask anything/ }), { target: { value: "Como fazer The Big Score?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("indisponível");
    expect(alert).not.toHaveTextContent(/stack|Error:|at /);
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(await screen.findByRole("heading", { name: "The Big Score" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("survives a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { if (url.startsWith("/api/health")) return new Response(JSON.stringify(health)); throw new TypeError("network"); }));
    render(<ChatApp />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Ask anything/ }), { target: { value: "Onde fica o Space Docker?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/servidor/);
  });

  it("restores the conversation after a refresh (sessionStorage) and 'New conversation' clears it", async () => {
    mockFetch(() => ({ status: 200, json: answer }));
    const first = render(<ChatApp />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Ask anything/ }), { target: { value: "Como fazer The Big Score?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByTestId("assistant-message");
    first.unmount();
    render(<ChatApp />);
    expect(await screen.findByText("Como fazer The Big Score?")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /New conversation/ })[0] as HTMLElement);
    expect(await screen.findByText("Your specialist for Los Santos.")).toBeInTheDocument();
  });

  it("passes the spoiler toggle to the API", async () => {
    const calls = mockFetch(() => ({ status: 200, json: answer }));
    render(<ChatApp />);
    fireEvent.click((await screen.findAllByRole("switch", { name: /Allow spoilers/ }))[0] as HTMLElement);
    fireEvent.change(screen.getByRole("textbox", { name: /Ask anything/ }), { target: { value: "Qual final é melhor?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(calls[0]).toMatchObject({ allowSpoilers: true }));
  });

  it("reflects demo mode in the status chip", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...health, ai: { configured: false } }))));
    render(<ChatApp />);
    expect(await screen.findByRole("status", { name: /DEMO/ })).toBeInTheDocument();
  });
});

describe("unverified information is flagged in the UI", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("shows a red 'unverified' badge and a warning line when an answer leans on unverified sources", async () => {
    sessionStorage.clear();
    const unverified: ChatResult = { ...answer, spoiler: false, sources: [{ ...answer.sources[0]!, verification: "unverified" }] };
    mockFetch(() => ({ status: 200, json: unverified }));
    render(<ChatApp />);
    fireEvent.change(await screen.findByRole("textbox", { name: /Ask anything/ }), { target: { value: "Quanto o Bureau Raid paga?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByTestId("unverified-note")).toHaveTextContent(/não verificada|unverified/i);
    expect(screen.getByText(/não verificado|unverified/i, { selector: "span" })).toBeInTheDocument();
  });
});
