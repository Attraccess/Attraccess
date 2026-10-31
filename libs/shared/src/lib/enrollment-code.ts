/**
 * The code a device shows while it waits for an admin approval. Shared by the API (which derives and
 * checks codes) and the web app (which normalises what the admin typed or scanned).
 */

/** Readable alphabet without 0/1/I/L/O so a code can be read off a screen without mistakes. */
export const ENROLLMENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ENROLLMENT_CODE_LENGTH = 6;

/**
 * Case, whitespace and the display hyphen do not matter. Returns null when the input cannot be a
 * code, so obvious typos never reach the server and use up the wrong-code limit.
 */
export function normalizeEnrollmentCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== ENROLLMENT_CODE_LENGTH) return null;
  for (const char of code) if (!ENROLLMENT_CODE_ALPHABET.includes(char)) return null;
  return code;
}

/** Display form of a normalised code, as the device shows it: `K7P-3XQ`. */
export function formatEnrollmentCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
