/**
 * External-link allow-list. Anything rendered as a clickable URL (sources, map links, markdown links)
 * must pass through here: https only, no credentials, host on the allow-list. The server never fetches
 * user-supplied URLs (no SSRF surface); this guards what the browser is invited to open.
 */
const ALLOWED_HOSTS = [
  "rockstargames.com", "support.rockstargames.com", "store.rockstargames.com", "gta.fandom.com", "gta5wiki.com", "ign.com",
  "gamepressure.com", "grandtheftwiki.com", "gtabase.com", "destructoid.com", "gtaintel.com", "github.com",
];

export function isSafeExternalUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

/** Returns the URL if safe, otherwise undefined (callers render plain text instead of a link). */
export function safeUrl(raw: string | undefined | null): string | undefined {
  return raw && isSafeExternalUrl(raw) ? raw : undefined;
}
