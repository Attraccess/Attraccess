import { ENROLLMENT_CODE_ALPHABET, ENROLLMENT_CODE_LENGTH } from '@attraccess/shared';
import { randomInt } from 'crypto';

// The alphabet, length, normalisation and display form are shared with the web app.
export {
  ENROLLMENT_CODE_ALPHABET,
  ENROLLMENT_CODE_LENGTH,
  formatEnrollmentCode,
  normalizeEnrollmentCode,
} from '@attraccess/shared';

export function generateEnrollmentCode(isTaken: (code: string) => boolean = () => false): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ENROLLMENT_CODE_LENGTH; i++) {
      code += ENROLLMENT_CODE_ALPHABET[randomInt(ENROLLMENT_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
}

/**
 * Turns the first 8 bytes of a digest into a code: the integer mod 31^6, written in base 31 with the
 * most significant character first. Used by the key-bound pairing code, which is not drawn at random.
 */
export function enrollmentCodeFromDigest(digest: Buffer): string {
  const base = BigInt(ENROLLMENT_CODE_ALPHABET.length);
  let modulus = BigInt(1);
  for (let i = 0; i < ENROLLMENT_CODE_LENGTH; i++) modulus *= base;
  let value = digest.readBigUInt64BE(0) % modulus;
  let code = '';
  for (let i = 0; i < ENROLLMENT_CODE_LENGTH; i++) {
    code = ENROLLMENT_CODE_ALPHABET[Number(value % base)] + code;
    value /= base;
  }
  return code;
}
