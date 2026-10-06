import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { hybridRetrieve, resetEmbeddingGuard } from "@/lib/rag/retrieval";
import { analyzeQuery } from "@/lib/rag/understanding";
import { readyDb } from "../helpers";

let db: Db;
beforeAll(async () => {
  db = await readyDb();
});

describe("embedding-model mismatch guard", () => {
  it("uses the vector leg when stored vectors match the runtime embedding model", async () => {
    resetEmbeddingGuard();
    const r = await hybridRetrieve(db, await analyzeQuery("Space Docker spaceship parts"));
    expect(r.counts.vector).toBeGreaterThan(0);
  });

  it("records provider, model and dimension for every chunk and in kb_meta", async () => {
    const [row] = await db.query<{ n: number }>("select count(*)::int n from chunks where embedding_provider is null or embedding_model is null or embedding_dimension is null");
    expect(row?.n).toBe(0);
    const meta = Object.fromEntries((await db.query<{ key: string; value: string }>("select key, value from kb_meta")).map((m) => [m.key, m.value]));
    expect(meta).toMatchObject({ embedding_provider: "local", embedding_model: "local-hash-384", embedding_dimension: "384" });
  });

  it("disables ONLY the vector leg when the KB was embedded with a different model (keyword + structured still work)", async () => {
    await db.query("update kb_meta set value = 'some-other-model' where key = 'embedding_model'");
    resetEmbeddingGuard();
    const r = await hybridRetrieve(db, await analyzeQuery("Space Docker spaceship parts"));
    expect(r.counts.vector).toBe(0);
    expect(r.counts.keyword).toBeGreaterThan(0);
    expect(r.counts.entity).toBeGreaterThan(0);
    expect(r.candidates.some((c) => c.entityId === "vehicle:space-docker")).toBe(true);
  });
});
