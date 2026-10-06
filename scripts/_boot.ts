import fs from "node:fs";

/** Loads .env / .env.local for CLI scripts (Next.js does this itself for the app). */
for (const f of [".env.local", ".env"]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}
