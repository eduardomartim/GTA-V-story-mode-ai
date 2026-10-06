import { z } from "zod";

/**
 * Server-side environment. Never import this module from a client component:
 * it is the only place secrets are read, and none of them use the NEXT_PUBLIC_ prefix.
 */
const schema = z.object({
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  AI_PROVIDER: z.enum(["anthropic", "openai", "google", "none"]).optional(),
  AI_MODEL: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  EMBEDDING_PROVIDER: z.enum(["local", "openai", "google"]).default("local"),
  API_ACCESS_KEY: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(600).default(20),
  DEBUG_MODE: z.string().optional(),
});

function empty<T extends Record<string, string | undefined>>(raw: T): T {
  // Treat blank values from .env files as "unset".
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === "" ? undefined : v])) as T;
}

export const env = schema.parse(empty(process.env as Record<string, string | undefined>));

export const isDebug = () => env.DEBUG_MODE === "true" && process.env.NODE_ENV !== "production";
