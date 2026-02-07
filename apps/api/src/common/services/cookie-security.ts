/**
 * Pure helpers for deriving cookie secure/sameSite from frontend and backend URLs.
 * Used by CookieConfigService; exported for unit testing.
 */

export function getHost(url: string | null): string | null {
  if (!url?.trim()) return null;
  try {
    return new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Base domain heuristic: last two segments (e.g. example.com).
 * Sibling subdomains (app.example.com, api.example.com) share the same base.
 */
export function getBaseDomain(host: string): string {
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  return parts.slice(-2).join('.');
}

/**
 * Same site if same origin, one host is subdomain of the other, or same base domain (sibling subdomains).
 * E.g. api.example.com and app.example.com are same site; app.example.com and api.other.com are not.
 */
export function isSameSite(frontendUrl: string | null, backendUrl: string | null): boolean {
  const frontHost = getHost(frontendUrl);
  const backHost = getHost(backendUrl);
  if (!frontHost || !backHost) return true;
  if (frontHost === backHost) return true;
  if (frontHost.endsWith('.' + backHost) || backHost.endsWith('.' + frontHost)) return true;
  return getBaseDomain(frontHost) === getBaseDomain(backHost);
}

/**
 * Derives secure and sameSite from configured frontend and backend URLs.
 * - secure: true when backend is https.
 * - sameSite: 'lax' when frontend and backend are same site; 'none' when cross-site (requires secure).
 */
export function deriveCookieSecurity(
  frontendUrl: string | null,
  backendUrl: string | null,
): { secure: boolean; sameSite: 'lax' | 'strict' | 'none' } {
  const secure = backendUrl?.startsWith('https://') ?? false;
  const sameSite = isSameSite(frontendUrl, backendUrl) ? 'lax' : secure ? 'none' : 'lax';
  return { secure, sameSite };
}
