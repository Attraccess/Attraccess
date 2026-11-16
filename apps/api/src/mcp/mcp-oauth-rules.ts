import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const ACCESS_TOKEN_PREFIX = 'mcp_at_';
export const REFRESH_TOKEN_PREFIX = 'mcp_rt_';
export const AUTHORIZATION_CODE_PREFIX = 'mcp_ac_';
export const AUTHORIZATION_REQUEST_PREFIX = 'mcp_rq_';

export const AUTHORIZATION_REQUEST_TTL_MS = 10 * 60 * 1000;
export const AUTHORIZATION_CODE_TTL_MS = 2 * 60 * 1000;
export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
/** Absolute lifetime of a grant, and so of its refresh tokens. */
export const GRANT_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

/** The public URL of an HTTPS or loopback deployment: the only ones that may serve OAuth. */
export function isSecureOrLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHostname(url.hostname));
  } catch {
    return false;
  }
}

/** Redirect URIs must be absolute `https:` or loopback `http:` (any port), without fragment or credentials. */
export function isAllowedRedirectUri(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || value.includes('#') || url.username || url.password) return false;
  return url.protocol === 'https:' || (url.protocol === 'http:' && isLoopbackHostname(url.hostname));
}

/** Warns the user when the redirect host is not a well-known, public website. */
export function isLoopbackRedirectUri(value: string): boolean {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

export const hashSecret = (value: string): string => createHash('sha256').update(value).digest('hex');

export const randomSecret = (prefix: string): string => `${prefix}${randomBytes(32).toString('base64url')}`;

export const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!CODE_VERIFIER_PATTERN.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

/** A space-separated list of permission names. Empty means "everything the user currently holds". */
export function parseScope(scope: string | undefined): string[] {
  return [...new Set((scope ?? '').split(/\s+/).filter(Boolean))].sort();
}

export type StaticOAuthClient = { clientId: string; clientName: string; redirectUris: string[] };

/** `MCP_OAUTH_CLIENTS`: optional JSON array of `{ client_id, client_name?, redirect_uris }`. */
export function parseStaticClients(raw: string | undefined): StaticOAuthClient[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('MCP_OAUTH_CLIENTS must be valid JSON');
  }
  if (!Array.isArray(parsed)) throw new Error('MCP_OAUTH_CLIENTS must be a JSON array');
  const ids = new Set<string>();
  return parsed.map((value) => {
    const client = (value ?? {}) as Record<string, unknown>;
    const clientId = client.client_id;
    if (typeof clientId !== 'string' || !/^[A-Za-z0-9._~-]{1,128}$/.test(clientId) || ids.has(clientId)) {
      throw new Error('MCP_OAUTH_CLIENTS: invalid or duplicate client_id');
    }
    ids.add(clientId);
    const redirectUris = client.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || !redirectUris.every(isAllowedRedirectUri)) {
      throw new Error(
        `MCP_OAUTH_CLIENTS: client ${clientId} needs redirect_uris that are https or loopback http without a fragment`,
      );
    }
    const clientName =
      typeof client.client_name === 'string' && client.client_name.trim() ? client.client_name : clientId;
    return { clientId, clientName: clientName.slice(0, 120), redirectUris: redirectUris as string[] };
  });
}
