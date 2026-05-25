// Parses and validates the TRUST_PROXY env var into an Express trust-proxy value
// FEATURE: Auth rate limiting — real client IP behind reverse proxy
import { isIP } from 'net';

export type TrustProxySetting = boolean | number | string;

const TRUST_PROXY_PRESETS = new Set(['loopback', 'linklocal', 'uniquelocal']);

export function resolveTrustProxySetting(raw: string | null | undefined): TrustProxySetting {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return false;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'false' || lower === 'off' || lower === 'none' || lower === 'no') {
    return false;
  }
  if (lower === 'true') {
    return true;
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

export function isValidTrustProxyValue(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (lower === 'true' || lower === 'false' || lower === 'off' || lower === 'none' || lower === 'no') {
    return true;
  }
  if (/^\d+$/.test(trimmed)) {
    return true;
  }
  return trimmed.split(',').every((token) => isValidTrustProxyEntry(token.trim()));
}

function isValidTrustProxyEntry(entry: string): boolean {
  if (entry === '') {
    return false;
  }
  if (TRUST_PROXY_PRESETS.has(entry.toLowerCase())) {
    return true;
  }
  const parts = entry.split('/');
  if (parts.length > 2) {
    return false;
  }
  const version = isIP(parts[0]);
  if (version === 0) {
    return false;
  }
  if (parts.length === 1) {
    return true;
  }
  if (!/^\d+$/.test(parts[1])) {
    return false;
  }
  return Number(parts[1]) <= (version === 4 ? 32 : 128);
}
