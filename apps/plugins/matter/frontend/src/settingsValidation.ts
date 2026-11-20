// Client-side checks of the connection settings, mirroring backend/connection/validation.ts, so a mistake shows next to
// the field instead of as a failed save. The backend stays the authority and repeats every check.

export const MAX_URL_LENGTH = 2048;
export const MAX_CA_BYTES = 64 * 1024;
const CERTIFICATE_BLOCK = /-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----/g;
/** The sidecar's service token: 32-512 printable ASCII characters (`SERVICE_TOKEN_PATTERN` in matter-contract). */
const TOKEN = /^[\x21-\x7e]{32,512}$/;

/** A translation key under `form.validation`, or null when the value is acceptable. Empty values are not judged. */
export type ValidationKey = 'urlScheme' | 'urlInvalid' | 'urlTooLong' | 'credential' | 'caShape' | 'caTooLong' | null;

export function validateUrl(value: string): ValidationKey {
  const url = value.trim();
  if (url === '') return null;
  if (url.length > MAX_URL_LENGTH) return 'urlTooLong';
  if (/[?#]/.test(url)) return 'urlInvalid';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'urlInvalid';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'urlScheme';
  if (parsed.username !== '' || parsed.password !== '' || parsed.hostname === '') return 'urlInvalid';
  return null;
}

export function validateCredential(value: string): ValidationKey {
  return value === '' || TOKEN.test(value) ? null : 'credential';
}

export function validateCa(value: string): ValidationKey {
  const pem = value.trim();
  if (pem === '') return null;
  if (new TextEncoder().encode(pem).length > MAX_CA_BYTES) return 'caTooLong';
  const blocks = pem.match(CERTIFICATE_BLOCK);
  return blocks && pem.replace(CERTIFICATE_BLOCK, '').trim() === '' ? null : 'caShape';
}
