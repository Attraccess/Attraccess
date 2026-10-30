import { randomInt } from 'crypto';

/** Readable alphabet without 0/1/I/L/O so a code can be read off a screen without mistakes. */
export const ENROLLMENT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ENROLLMENT_CODE_LENGTH = 6;

export function generateEnrollmentCode(isTaken: (code: string) => boolean = () => false): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < ENROLLMENT_CODE_LENGTH; i++) {
      code += ENROLLMENT_CODE_ALPHABET[randomInt(ENROLLMENT_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
}

/** Case, whitespace and the display hyphen do not matter; returns null when the input cannot be a code. */
export function normalizeEnrollmentCode(input: string): string | null {
  const code = input.replace(/[\s-]/g, '').toUpperCase();
  if (code.length !== ENROLLMENT_CODE_LENGTH) return null;
  for (const char of code) if (!ENROLLMENT_CODE_ALPHABET.includes(char)) return null;
  return code;
}

export function formatEnrollmentCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
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
