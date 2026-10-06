import "./_boot";
import { closeDb } from "@/lib/db/client";
import { runChat } from "@/lib/rag/pipeline";
import type { ChatTurn } from "@/lib/rag/types";

/** Dev helper: `npm run ask -- "question" ["follow-up" ...]` (demo mode unless an AI provider is configured). */
const questions = process.argv.slice(2);
const history: ChatTurn[] = [];
for (const q of questions) {
  const r = await runChat({ message: q, history });
  console.log(`\n=== ${q}\nmode=${r.mode} lang=${r.lang} intents=${r.meta.intents.join(",")} entities=${r.meta.entities.join(",")} retrieved=${r.meta.retrievalCount} ${r.meta.latencyMs}ms`);
  console.log(r.answer);
  console.log("cards:", r.cards.map((c) => `${c.kind}${"name" in c ? `:${c.name}` : ""}`).join(" | "));
  console.log("sources:", r.sources.map((s) => `${s.index}:${s.sourceName}`).join(" | "), "| followUps:", r.followUps.map((f) => f.label).join(", "));
  history.push({ role: "user", content: q }, { role: "assistant", content: r.answer, entities: r.meta.entities });
}
await closeDb();
