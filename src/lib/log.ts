/**
 * Structured JSON logging. Policy: never log secrets, request bodies, or user message text
 * (only lengths/hashes) unless DEBUG_MODE=true in a non-production environment.
 */
const SECRET_PATTERN = /(sk-[a-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,}|eyJ[0-9A-Za-z_-]{20,}\.[0-9A-Za-z_-]{10,})/g;

export function redact(value: string): string {
  return value.replace(SECRET_PATTERN, "[redacted]");
}

export function log(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const safe = JSON.parse(redact(JSON.stringify({ t: new Date().toISOString(), level, event, ...fields }))) as Record<string, unknown>;
  const line = JSON.stringify(safe);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.NODE_ENV !== "test") console.log(line);
}
