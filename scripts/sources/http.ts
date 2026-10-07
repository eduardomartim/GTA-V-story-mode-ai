/**
 * Polite source fetcher — stage 1 of the ingestion pipeline (Source → Extraction → …).
 *
 * Rules it enforces (never relaxed):
 *  - only hosts on the allow-list below;
 *  - robots.txt is read and obeyed (longest-match Allow/Disallow for `User-agent: *`), including Crawl-delay;
 *  - one request at a time, with an identifying User-Agent;
 *  - anti-bot / challenge pages (e.g. Cloudflare "Just a moment...") are recorded as BLOCKED and never retried
 *    or worked around;
 *  - responses are cached under `.cache/sources/` (git-ignored) so extraction never re-hits the site.
 *
 * CLI: scripts/sources/fetch.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const UA = "gta-v-story-mode-ai/1.0 (+https://github.com/eduardomartim/gta-v-story-mode-ai; portfolio research, low volume)";
export const CACHE_DIR = path.join(process.cwd(), ".cache", "sources");

/** host → minimum delay between requests (ms). robots.txt Crawl-delay raises it, never lowers it. */
const HOSTS: Record<string, number> = {
  "www.grandtheftwiki.com": 10_000,
  "raw.githubusercontent.com": 1_000,
};

interface Rules { allow: string[]; disallow: string[]; delayMs: number }
const robotsCache = new Map<string, Rules>();
const lastHit = new Map<string, number>();

function parseRobots(txt: string): Omit<Rules, "delayMs"> & { delay?: number } {
  const out = { allow: [] as string[], disallow: [] as string[], delay: undefined as number | undefined };
  let applies = false;
  let sawRule = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = (m[1] as string).toLowerCase();
    const val = (m[2] as string).trim();
    if (key === "user-agent") {
      if (sawRule) { applies = false; sawRule = false; }
      if (val === "*") applies = true;
      continue;
    }
    sawRule = true;
    if (!applies) continue;
    if (key === "allow" && val) out.allow.push(val);
    if (key === "disallow" && val) out.disallow.push(val);
    if (key === "crawl-delay") out.delay = Number(val);
  }
  return out;
}

function ruleMatches(rule: string, target: string): boolean {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(target);
}

/** Longest matching rule wins; Allow wins ties (Google/RFC 9309 semantics). */
export function robotsAllows(rules: Pick<Rules, "allow" | "disallow">, target: string): boolean {
  const best = (list: string[]) => Math.max(-1, ...list.filter((r) => ruleMatches(r, target)).map((r) => r.length));
  return best(rules.allow) >= best(rules.disallow);
}

async function rulesFor(u: URL): Promise<Rules> {
  const cached = robotsCache.get(u.host);
  if (cached) return cached;
  const base = HOSTS[u.host] ?? 10_000;
  let rules: Rules = { allow: [], disallow: [], delayMs: base };
  if (u.host !== "raw.githubusercontent.com") {
    const res = await fetch(`${u.protocol}//${u.host}/robots.txt`, { headers: { "user-agent": UA } });
    if (res.ok) {
      const p = parseRobots(await res.text());
      rules = { allow: p.allow, disallow: p.disallow, delayMs: Math.max(base, (p.delay ?? 0) * 1000) };
    }
  }
  robotsCache.set(u.host, rules);
  return rules;
}

export function cachePath(url: string): string {
  const u = new URL(url);
  const slug = decodeURIComponent(u.pathname + u.search).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 8);
  return path.join(CACHE_DIR, u.host, `${slug}-${hash}`);
}

export interface Cached { url: string; status: number; fetchedAt: string; blocked: boolean; body: string }

export function readCached(url: string): Cached | null {
  const p = cachePath(url);
  if (!fs.existsSync(`${p}.json`)) return null;
  const meta = JSON.parse(fs.readFileSync(`${p}.json`, "utf8")) as Omit<Cached, "body">;
  return { ...meta, body: fs.existsSync(`${p}.body`) ? fs.readFileSync(`${p}.body`, "utf8") : "" };
}

/** URLs of every successfully cached page of a host (used by extractors that scan "all mission pages"). */
export function listCached(host: string): string[] {
  const dir = path.join(CACHE_DIR, host);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { url: string; status: number; blocked: boolean })
    .filter((m) => m.status === 200 && !m.blocked).map((m) => m.url).sort();
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(url: string): Promise<Cached> {
  const hit = readCached(url);
  if (hit) return hit;
  const u = new URL(url);
  if (u.protocol !== "https:" || !(u.host in HOSTS)) throw new Error(`host not on the allow-list: ${u.host}`);
  const rules = await rulesFor(u);
  if (!robotsAllows(rules, u.pathname + u.search)) throw new Error(`robots.txt disallows ${u.pathname}${u.search}`);
  const since = Date.now() - (lastHit.get(u.host) ?? 0);
  if (since < rules.delayMs) await wait(rules.delayMs - since);
  lastHit.set(u.host, Date.now());
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json,text/plain" }, redirect: "follow" });
  const body = await res.text();
  const blocked = /<title>Just a moment\.\.\.<\/title>|challenges\.cloudflare\.com|cf-chl/i.test(body.slice(0, 4000));
  const out: Cached = { url, status: res.status, fetchedAt: new Date().toISOString(), blocked, body: blocked ? "" : body };
  const p = cachePath(url);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(`${p}.json`, JSON.stringify({ url, status: out.status, fetchedAt: out.fetchedAt, blocked }, null, 1));
  if (!blocked) fs.writeFileSync(`${p}.body`, body);
  return out;
}

