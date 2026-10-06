import type { AIProvider, GenerateRequest } from "@/lib/ai/provider";
import { getDb } from "@/lib/db/client";
import { ensureReady } from "@/lib/kb/bootstrap";

export async function readyDb() {
  await ensureReady();
  return getDb();
}

export interface FakeProvider extends AIProvider {
  calls: GenerateRequest[];
}

/** Deterministic provider double: records every request and replies with `reply(req)`. */
export function fakeProvider(reply: (req: GenerateRequest) => string | Promise<string> = () => "Resposta de teste [S1]."): FakeProvider {
  const calls: GenerateRequest[] = [];
  return {
    id: "openai", model: "fake-model", calls,
    async generate(req) {
      calls.push(req);
      return { text: await reply(req), usage: { inputTokens: 100, outputTokens: 20 } };
    },
  };
}
