import { SERVICE_TOKEN_PATTERN } from '@attraccess/matter-contract';
import { X509Certificate } from 'node:crypto';
import { z } from 'zod';

export const MAX_URL_LENGTH = 2048;
export const MAX_CA_BYTES = 64 * 1024;
const CERTIFICATE_BLOCK = /-----BEGIN CERTIFICATE-----[A-Za-z0-9+/=\s]+?-----END CERTIFICATE-----/g;

/** http(s) only, no userinfo, query or fragment. A path prefix (for a reverse proxy) is allowed. Returns it normalized. */
export function normalizeUrl(value: string): string | null {
  if (value.length > MAX_URL_LENGTH || /[?#]/.test(value)) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username !== '' || parsed.password !== '' || parsed.hostname === '') return null;
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/** One or more X.509 PEM certificates and nothing else. */
export function isCertificateBundle(value: string): boolean {
  if (Buffer.byteLength(value) > MAX_CA_BYTES) return false;
  const blocks = value.match(CERTIFICATE_BLOCK);
  if (!blocks || value.replace(CERTIFICATE_BLOCK, '').trim() !== '') return false;
  try {
    for (const block of blocks) new X509Certificate(block);
    return true;
  } catch {
    return false;
  }
}

export const settingsSchema = z.strictObject({
  url: z
    .string()
    .max(MAX_URL_LENGTH, 'The URL is too long.')
    .trim()
    .refine(
      (value) => normalizeUrl(value) !== null,
      'The URL must be http or https, without credentials, query or fragment (a path prefix is allowed).',
    ),
  credential: z
    .string()
    .regex(SERVICE_TOKEN_PATTERN, 'The credential must be 32-512 printable ASCII characters.')
    .optional(),
  caCertificate: z
    .string()
    .refine(isCertificateBundle, 'The CA certificate must be one or more X.509 PEM certificates (at most 64 KiB).')
    .nullable()
    .optional(),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/** Messages only; the submitted values (especially the credential) are never echoed back. */
export function validationMessages(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`);
}
