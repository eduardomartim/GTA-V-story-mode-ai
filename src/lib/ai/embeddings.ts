import { env } from "@/lib/env";
import { contentTokens } from "@/lib/text";
import { expandQuery } from "@/lib/rag/glossary";

export const EMBEDDING_DIM = 384;

export interface EmbeddingProvider {
  /** Model identifier stored with every vector, e.g. "openai-text-embedding-3-small-384". */
  readonly id: string;
  /** Provider family: local | openai | google. */
  readonly provider: "local" | "openai" | "google";
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

/* ───────────────────────── local: hashed n-gram embedder ─────────────────────────
 * Dependency-free, deterministic, free. It is a *lexical-semantic* embedder (feature hashing of
 * words, bigrams and character trigrams, L2-normalised) — good enough for dev/demo and tests, and it
 * keeps `npm run db:seed` working offline. For production quality use EMBEDDING_PROVIDER=openai|google.
 */
function fnv1a(str: string, seed = 2166136261): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function addFeature(vec: Float32Array, feature: string, weight: number) {
  const h = fnv1a(feature);
  const idx = h % EMBEDDING_DIM;
  const sign = (fnv1a(feature, 0x9e3779b1) & 1) === 0 ? 1 : -1;
  vec[idx] = (vec[idx] ?? 0) + sign * weight;
}

export function hashEmbed(text: string): number[] {
  const vec = new Float32Array(EMBEDDING_DIM);
  const tokens = contentTokens(expandQuery(text));
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  for (const [t, c] of tf) {
    addFeature(vec, `w:${t}`, 1 + Math.log(c));
    if (t.length >= 5) for (let i = 0; i <= t.length - 3; i++) addFeature(vec, `c:${t.slice(i, i + 3)}`, 0.18);
  }
  for (let i = 0; i < tokens.length - 1; i++) addFeature(vec, `b:${tokens[i]}_${tokens[i + 1]}`, 0.6);
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (x) => x / norm);
}

const localProvider: EmbeddingProvider = {
  id: "local-hash-384",
  provider: "local",
  dimension: EMBEDDING_DIM,
  async embed(texts) {
    return texts.map(hashEmbed);
  },
};

/* ───────────────────────── remote providers (384-dim) ───────────────────────── */
async function postJson<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Embedding provider HTTP ${res.status}`);
  return (await res.json()) as T;
}

const openaiProvider: EmbeddingProvider = {
  id: "openai-text-embedding-3-small-384",
  provider: "openai",
  dimension: EMBEDDING_DIM,
  async embed(texts) {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 96) {
      const res = await postJson<{ data: { embedding: number[] }[] }>(
        "https://api.openai.com/v1/embeddings",
        { authorization: `Bearer ${env.OPENAI_API_KEY}` },
        { model: "text-embedding-3-small", input: texts.slice(i, i + 96), dimensions: EMBEDDING_DIM },
      );
      out.push(...res.data.map((d) => d.embedding));
    }
    return out;
  },
};

const googleProvider: EmbeddingProvider = {
  id: "google-gemini-embedding-384",
  provider: "google",
  dimension: EMBEDDING_DIM,
  async embed(texts) {
    if (!env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not configured");
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 50) {
      const batch = texts.slice(i, i + 50);
      const res = await postJson<{ embeddings: { values: number[] }[] }>(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents",
        { "x-goog-api-key": env.GOOGLE_API_KEY },
        {
          requests: batch.map((t) => ({
            model: "models/gemini-embedding-001",
            content: { parts: [{ text: t }] },
            outputDimensionality: EMBEDDING_DIM,
          })),
        },
      );
      out.push(...res.embeddings.map((e) => normalizeVec(e.values)));
    }
    return out;
  },
};

function normalizeVec(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / n);
}

export function getEmbeddingProvider(): EmbeddingProvider {
  switch (env.EMBEDDING_PROVIDER) {
    case "openai":
      return openaiProvider;
    case "google":
      return googleProvider;
    default:
      return localProvider;
  }
}

/** Small LRU for query embeddings: repeated/follow-up questions never pay twice. */
const cache = new Map<string, number[]>();
export async function embedQuery(text: string, provider = getEmbeddingProvider()): Promise<number[]> {
  const key = `${provider.id}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [vec] = await provider.embed([text]);
  if (!vec) throw new Error("Embedding provider returned no vector");
  cache.set(key, vec);
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return vec;
}
