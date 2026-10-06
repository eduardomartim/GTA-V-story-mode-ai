import "./_boot";
import { closeDb, getDb, runMigrations } from "@/lib/db/client";

const db = await getDb();
const applied = await runMigrations(db);
console.log(applied.length ? `Applied migrations: ${applied.join(", ")}` : "Database is up to date.");
await closeDb();
