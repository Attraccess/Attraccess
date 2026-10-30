// Client-side shape of the rotating device enrollment code; mirrors apps/api/src/device-enrollment

/** Query parameter of the link a device (or its QR code) points to: `<app URL>/?enroll=CODE`. */
export const DEVICE_ENROLLMENT_PARAM = 'enroll';

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 6;

/**
 * Case, whitespace and the display hyphen do not matter. Returns null when the input cannot be a
 * code, so obvious typos never reach the server and use up the wrong-code limit.
 */
export function normalizeEnrollmentCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== LENGTH) return null;
  for (const char of code) if (!ALPHABET.includes(char)) return null;
  return code;
}

/**
 * Reads a code from scanned QR content: an enroll link (`…/?enroll=CODE`) or the bare code.
 * Returns null for anything else.
 */
export function enrollmentCodeFromScan(rawValue: string): string | null {
  const bare = normalizeEnrollmentCode(rawValue);
  if (bare) return bare;
  try {
    const linked = new URL(rawValue).searchParams.get(DEVICE_ENROLLMENT_PARAM);
    return linked ? normalizeEnrollmentCode(linked) : null;
  } catch {
    return null;
  }
}

/** Display form of a normalised code, as the device shows it: `K7P-3XQ`. */
export function formatEnrollmentCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}
