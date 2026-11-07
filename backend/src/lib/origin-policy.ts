/** Explicit browser origin policy for both CORS and CSRF. No wildcard or reflection. */
export function normalizeOrigin(value: string): string {
  const text = value.trim();
  let parsed: URL;
  try { parsed = new URL(text); }
  catch { throw new Error(`Invalid WEB_ORIGIN/WEB_ORIGINS entry: ${text}`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`WEB_ORIGIN/WEB_ORIGINS must contain browser origins only, no paths: ${text}`);
  }
  return parsed.origin;
}

export function configuredOrigins(primary: string, extra = ''): string[] {
  return [...new Set([primary, ...extra.split(',')].map(x => x.trim()).filter(Boolean).map(normalizeOrigin))];
}

export function originAllowed(received: string | undefined, allowed: readonly string[]): boolean {
  if (!received) return true; // same-origin requests and server-to-server calls may omit Origin
  try { return allowed.includes(normalizeOrigin(received)); }
  catch { return false; }
}
