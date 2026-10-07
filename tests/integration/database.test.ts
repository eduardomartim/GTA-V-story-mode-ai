import { beforeAll, describe, expect, it } from "vitest";
import { toVectorLiteral, type Db } from "@/lib/db/client";
import { hashEmbed } from "@/lib/ai/embeddings";
import { readyDb } from "../helpers";

let db: Db;
beforeAll(async () => {
  db = await readyDb();
});

describe("PostgreSQL + pgvector schema", () => {
  it("seeds the knowledge base", async () => {
    const [row] = await db.query<{ e: number; c: number; r: number; a: number }>(
      "select (select count(*) from entities)::int e, (select count(*) from chunks)::int c, (select count(*) from relationships)::int r, (select count(*) from aliases)::int a");
    expect(row?.e).toBeGreaterThan(150);
    expect(row?.c).toBeGreaterThanOrEqual(row?.e ?? 0);
    expect(row?.r).toBeGreaterThan(100);
    expect(row?.a).toBeGreaterThan(row?.e ?? 0);
  });

  it("stores embeddings as vector(384) and ranks by cosine distance (pgvector)", async () => {
    const q = toVectorLiteral(hashEmbed("space docker spaceship parts omega"));
    const rows = await db.query<{ entity_id: string }>("select entity_id from chunks order by embedding <=> $1::vector limit 5", [q]);
    expect(rows.map((r) => r.entity_id)).toContain("vehicle:space-docker");
  });

  it("has an HNSW vector index and a GIN full-text index", async () => {
    const idx = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where tablename = 'chunks'");
    const defs = idx.map((i) => i.indexdef).join("\n");
    expect(defs).toMatch(/hnsw .*vector_cosine_ops/);
    expect(defs).toMatch(/gin .*tsv/);
  });

  it("full-text search works on the generated tsvector column", async () => {
    const rows = await db.query<{ entity_id: string }>("select entity_id from chunks where tsv @@ to_tsquery('simple', 'bawsaq') ");
    expect(rows.map((r) => r.entity_id)).toContain("stock:stock-market");
  });

  it("DB constraint rejects an entity that is both Story Mode and Online-only", async () => {
    await expect(
      db.query("insert into entities(id,type,name,summary,story_mode,online_only) values('mission:bad','mission','Bad','x',true,true)"),
    ).rejects.toThrow();
  });

  it("rejects malformed ids and unknown entity types", async () => {
    await expect(db.query("insert into entities(id,type,name,summary) values('Bad Id','mission','x','y')")).rejects.toThrow();
    await expect(db.query("insert into entities(id,type,name,summary) values('mission:z','nonsense','x','y')")).rejects.toThrow();
  });

  it("no Story Mode chunk is flagged Online and no Online chunk is flagged Story", async () => {
    const [bad] = await db.query<{ n: number }>("select count(*)::int n from chunks where story_mode = online_only");
    expect(bad?.n).toBe(0);
  });

  it("every chunk carries source provenance", async () => {
    const [bad] = await db.query<{ n: number }>("select count(*)::int n from chunks where source_id is null or source_url is null or confidence is null");
    expect(bad?.n).toBe(0);
  });

  it("typed tables mirror the entities (missions, locations with map coordinates)", async () => {
    // 79 story-list missions; Strangers and Freaks / side missions are separate entries (mission_type stranger|side).
    const [m] = await db.query<{ n: number }>("select count(*)::int n from missions where mission_type not in ('stranger','side')");
    expect(m?.n).toBe(79);
    const [all] = await db.query<{ n: number }>("select count(*)::int n from missions");
    const [ents] = await db.query<{ n: number }>("select count(*)::int n from entities where type = 'mission'");
    expect(all?.n).toBe(ents?.n);
    const loc = await db.query<{ map_x: number; map_y: number; coord_precision: string }>("select map_x, map_y, coord_precision from locations where entity_id = 'location:del-perro-pier'");
    expect(loc[0]?.map_x).toBeGreaterThan(0);
    expect(loc[0]?.coord_precision).toBe("approximate");
  });

  it("parameters are bound, not interpolated (SQL injection attempt is inert)", async () => {
    const evil = "x'; drop table entities; --";
    await db.query("select * from aliases where alias_norm = $1", [evil]);
    const [row] = await db.query<{ n: number }>("select count(*)::int n from entities");
    expect(row?.n).toBeGreaterThan(0);
  });
});
