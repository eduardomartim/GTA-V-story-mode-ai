import fs from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";

export type Row = Record<string, unknown>;

/** Minimal database port. Implemented by node-postgres (Supabase/Postgres) and PGlite (embedded Postgres). */
export interface Db {
  readonly kind: "pg" | "pglite";
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

type PgClientLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
};

function wrapPg(client: PgClientLike, root: { pool: import("pg").Pool } | null): Db {
  const self: Db = {
    kind: "pg",
    async query<T>(sql: string, params?: unknown[]) {
      const res = await client.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await client.query(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      if (!root) return fn(self); // already inside a transaction
      const conn = await root.pool.connect();
      try {
        await conn.query("begin");
        const out = await fn(wrapPg(conn, null));
        await conn.query("commit");
        return out;
      } catch (err) {
        await conn.query("rollback");
        throw err;
      } finally {
        conn.release();
      }
    },
    async close() {
      if (root) await root.pool.end();
    },
  };
  return self;
}

/** `require` (or `true`) = TLS with certificate verification. `no-verify` = TLS without verification (explicit opt-out, logged). */
function sslOption(mode: string | undefined): false | { rejectUnauthorized: boolean } | undefined {
  if (!mode) return undefined;
  if (mode === "no-verify") {
    console.warn(JSON.stringify({ level: "warn", event: "db_tls_no_verify", note: "TLS certificate verification is disabled (DATABASE_SSL=no-verify)" }));
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

async function createPg(url: string): Promise<Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: url,
    max: 5,
    ssl: sslOption(env.DATABASE_SSL),
    statement_timeout: 15_000,
  });
  return wrapPg(pool, { pool });
}

type PgliteLike = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
  exec: (sql: string) => Promise<unknown>;
  transaction: <T>(fn: (tx: PgliteLike) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
};

function wrapPglite(db: PgliteLike): Db {
  return {
    kind: "pglite",
    async query<T>(sql: string, params?: unknown[]) {
      const res = await db.query(sql, params);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await db.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      return db.transaction((tx) => fn(wrapPglite(tx)));
    },
    async close() {
      await db.close();
    },
  };
}

async function createPglite(): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { vector } = await import("@electric-sql/pglite-pgvector");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
  const dir = env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  if (!dir.startsWith("memory://")) fs.mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir, { extensions: { vector, pg_trgm } });
  return wrapPglite(db as unknown as PgliteLike);
}

const globalForDb = globalThis as unknown as { __gtaDb?: Promise<Db> };

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): Promise<Db> {
  if (!globalForDb.__gtaDb) {
    globalForDb.__gtaDb = (env.DATABASE_URL ? createPg(env.DATABASE_URL) : createPglite()).catch((err) => {
      globalForDb.__gtaDb = undefined;
      throw err;
    });
  }
  return globalForDb.__gtaDb;
}

export async function closeDb(): Promise<void> {
  const p = globalForDb.__gtaDb;
  globalForDb.__gtaDb = undefined;
  if (p) await (await p).close();
}

/** pgvector accepts the text form "[0.1,0.2,...]". Always passed as a bound parameter + ::vector cast. */
export function toVectorLiteral(v: ArrayLike<number>): string {
  return `[${Array.from(v, (x) => (Number.isFinite(x) ? Number(x.toFixed(6)) : 0)).join(",")}]`;
}

export async function runMigrations(db: Db): Promise<string[]> {
  await db.exec("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("insert into schema_migrations(name) values ($1)", [file]);
    });
    applied.push(file);
  }
  return applied;
}
