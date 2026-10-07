import type { AuthenticatorTransportFuture } from '@simplewebauthn/server';
export const CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const RP_NAME = 'Attraccess';

/** Where the ceremony is happening: the configured app URL, plus the browser's own origin when it is the same host. */
export interface RelyingParty {
  rpID: string;
  expectedOrigin: string[];
}
export function readChallengeFromClientData(clientDataJSON: string): string | null {
  try {
    const parsed = JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8'));
    return typeof parsed?.challenge === 'string' ? parsed.challenge : null;
  } catch {
    return null;
  }
}
export function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) {
    return undefined;
  }
  return value.split(',').filter(Boolean) as AuthenticatorTransportFuture[];
}
export function safeOrigin(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
export function hostnameOf(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
