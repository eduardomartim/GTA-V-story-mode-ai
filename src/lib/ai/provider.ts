import { env } from "@/lib/env";

export interface GenerateRequest {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxTokens: number;
  temperature: number;
}

export interface GenerateResult {
  text: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

/** Provider-agnostic chat model port. The RAG pipeline depends only on this interface. */
export interface AIProvider {
  readonly id: "anthropic" | "openai" | "google";
  readonly model: string;
  generate(req: GenerateRequest, signal?: AbortSignal): Promise<GenerateResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ProviderError";
  }
}

async function post<T>(url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: signal ?? AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    // Never forward provider bodies (they can echo request content); status only.
    throw new ProviderError(`AI provider returned HTTP ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

function anthropic(apiKey: string, model: string): AIProvider {
  return {
    id: "anthropic", model,
    async generate(req, signal) {
      const r = await post<{ content: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }>(
        "https://api.anthropic.com/v1/messages",
        { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        { model, max_tokens: req.maxTokens, temperature: req.temperature, system: req.system, messages: req.messages },
        signal,
      );
      return { text: r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join(""), usage: { inputTokens: r.usage?.input_tokens, outputTokens: r.usage?.output_tokens } };
    },
  };
}

function openai(apiKey: string, model: string): AIProvider {
  return {
    id: "openai", model,
    async generate(req, signal) {
      const r = await post<{ choices: Array<{ message: { content: string | null } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } }>(
        "https://api.openai.com/v1/chat/completions",
        { authorization: `Bearer ${apiKey}` },
        { model, max_tokens: req.maxTokens, temperature: req.temperature, messages: [{ role: "system", content: req.system }, ...req.messages] },
        signal,
      );
      return { text: r.choices[0]?.message.content ?? "", usage: { inputTokens: r.usage?.prompt_tokens, outputTokens: r.usage?.completion_tokens } };
    },
  };
}

function google(apiKey: string, model: string): AIProvider {
  return {
    id: "google", model,
    async generate(req, signal) {
      const r = await post<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }>(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": apiKey },
        {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
          generationConfig: { maxOutputTokens: req.maxTokens, temperature: req.temperature },
        },
        signal,
      );
      return { text: r.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "", usage: { inputTokens: r.usageMetadata?.promptTokenCount, outputTokens: r.usageMetadata?.candidatesTokenCount } };
    },
  };
}

const DEFAULT_MODELS = { anthropic: "claude-haiku-4-5-20251001", openai: "gpt-4o-mini", google: "gemini-2.5-flash" } as const;

/** Returns the configured provider, or `null` (→ clearly-labelled demo mode) when none is configured. */
export function getAIProvider(): AIProvider | null {
  const pick =
    env.AI_PROVIDER ??
    (env.ANTHROPIC_API_KEY ? "anthropic" : env.OPENAI_API_KEY ? "openai" : env.GOOGLE_API_KEY ? "google" : "none");
  const model = env.AI_MODEL;
  if (pick === "anthropic" && env.ANTHROPIC_API_KEY) return anthropic(env.ANTHROPIC_API_KEY, model ?? DEFAULT_MODELS.anthropic);
  if (pick === "openai" && env.OPENAI_API_KEY) return openai(env.OPENAI_API_KEY, model ?? DEFAULT_MODELS.openai);
  if (pick === "google" && env.GOOGLE_API_KEY) return google(env.GOOGLE_API_KEY, model ?? DEFAULT_MODELS.google);
  return null;
}
