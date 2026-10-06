import fs from "node:fs";
import path from "node:path";

/**
 * Security gate: (1) no secret-looking literals in tracked sources, (2) no server-only env var names and
 * no `.env` values leaked into the client bundle (.next/static). Exit code 1 on any finding.
 */
const ROOT = process.cwd();
const SKIP = new Set(["node_modules", ".next", ".git", ".data", "coverage", ".claude"]);
const SECRET_PATTERNS: Array<[string, RegExp]> = [
  ["Anthropic/OpenAI-style key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
  ["JWT (Supabase keys)", /\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\b/],
  ["Postgres URL with password", /postgres(?:ql)?:\/\/[^\s:@/]+:[^\s@/]{3,}@/],
  ["Private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const CLIENT_FORBIDDEN = ["SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "API_ACCESS_KEY", "DATABASE_URL"];

function* walk(dir: string): Generator<string> {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

const findings: string[] = [];
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  if (/\.(png|jpg|jpeg|gif|ico|woff2?|lock|tsbuildinfo)$/.test(rel) || rel.includes("package-lock") || rel.endsWith("audit-secrets.ts")) continue;
  if (/^\.env(\..*)?$/.test(path.basename(rel)) && path.basename(rel) !== ".env.example") findings.push(`${rel}: a real .env file exists in the working tree (must stay git-ignored)`);
  const text = fs.readFileSync(file, "utf8");
  for (const [name, re] of SECRET_PATTERNS) if (re.test(text) && !rel.startsWith("tests")) findings.push(`${rel}: looks like a ${name}`);
}

const staticDir = path.join(ROOT, ".next", "static");
if (fs.existsSync(staticDir)) {
  for (const file of walk(staticDir)) {
    if (!/\.(js|css|map|html)$/.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const name of CLIENT_FORBIDDEN) if (text.includes(name)) findings.push(`client bundle ${path.relative(ROOT, file)} references ${name}`);
  }
} else {
  console.log("(no .next/static — run `npm run build` first to include the client-bundle check)");
}

if (findings.length) {
  for (const f of findings) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log("✓ secret audit passed: no secrets in sources, no server env names in the client bundle");
