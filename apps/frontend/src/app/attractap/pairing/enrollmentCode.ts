// Client-side helpers for the rotating device enrollment code. Alphabet, normalisation and display
// form come from @attraccess/shared, the same code the API uses.
import { normalizeEnrollmentCode } from '@attraccess/shared';

export { formatEnrollmentCode, normalizeEnrollmentCode } from '@attraccess/shared';

/** Query parameter of the link a device (or its QR code) points to: `<app URL>/?enroll=CODE`. */
export const DEVICE_ENROLLMENT_PARAM = 'enroll';

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
