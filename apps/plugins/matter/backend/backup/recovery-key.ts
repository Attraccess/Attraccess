// The recovery key: 32 random bytes that encrypt every backup. It is shown to the administrator exactly once, as
// grouped uppercase base32 (RFC 4648 alphabet), so it can be written down and typed back in.
import { createHash, randomBytes } from 'node:crypto';

export const RECOVERY_KEY_BYTES = 32;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const GROUP = 4;

export class InvalidRecoveryKeyError extends Error {
  constructor() {
    super('The recovery key is not valid. It consists of 52 letters and digits, usually written in groups of four.');
    this.name = 'InvalidRecoveryKeyError';
  }
}

export function generateRecoveryKey(): Buffer {
  return randomBytes(RECOVERY_KEY_BYTES);
}

/** The first 16 hex characters of SHA-256(key): identifies a key without revealing it. */
export function recoveryKeyId(key: Buffer): string {
  return createHash('sha256').update(key).digest('hex').slice(0, 16);
}

export function encodeBase32(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** `ABCD-EFGH-...` */
export function formatRecoveryKey(key: Buffer): string {
  return (encodeBase32(key).match(new RegExp(`.{1,${GROUP}}`, 'g')) ?? []).join('-');
}

/** Accepts any grouping, case and separators. Throws `InvalidRecoveryKeyError` for anything that is not a key. */
export function parseRecoveryKey(text: string): Buffer {
  const normalized = text.replace(/[\s-]/g, '').toUpperCase();
  if (normalized.length !== Math.ceil((RECOVERY_KEY_BYTES * 8) / 5)) throw new InvalidRecoveryKeyError();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new InvalidRecoveryKeyError();
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  // The 52nd character carries 4 padding bits, which must be zero in a key this code produced.
  if (bytes.length !== RECOVERY_KEY_BYTES || (value & ((1 << bits) - 1)) !== 0) throw new InvalidRecoveryKeyError();
  return Buffer.from(bytes);
}
