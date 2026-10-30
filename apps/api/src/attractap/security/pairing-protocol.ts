import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { enrollmentCodeFromDigest } from '../../device-enrollment/enrollment-code';

/**
 * Key-bound rotating code. The server commits to its nonce, the reader answers with its own, the
 * server reveals. Both sides derive the same code from both keys and both nonces, so an
 * attacker who swapped a key shows the admin a code that does not match the one on the reader.
 * The firmware derives the same values (see tests/pairing-vectors.json, run by both sides).
 */
export const COMMIT_TAG = 'attractap-pairing-commit-v1';
export const CODE_TAG = 'attractap-pairing-code-v1';
export const NONCE_BYTES = 16;

export const LITE_COLOURS = ['red', 'green', 'blue', 'yellow', 'white', 'magenta'] as const;
export type LiteColour = (typeof LITE_COLOURS)[number];
export const LITE_SEGMENTS = 8;
/** The pattern comes from digest bytes 8..23, the code from bytes 0..7. */
const PATTERN_OFFSET = 8;

export interface DerivedCode {
  /** 6 characters of the enrollment alphabet, without the display hyphen. */
  code: string;
  pattern: LiteColour[];
}

/** Length-prefixed concatenation so field boundaries cannot be shifted. */
function hashFields(tag: string, ...fields: Buffer[]): Buffer {
  const hash = createHash('sha256');
  const encode = (buffer: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(buffer.length);
    hash.update(length).update(buffer);
  };
  encode(Buffer.from(tag));
  fields.forEach(encode);
  return hash.digest();
}

export function generateNonce(): Buffer {
  return randomBytes(NONCE_BYTES);
}

/** Cs = SHA-256(tag || Ps || Pr || Ns) */
export function commitment(serverPublicKey: Buffer, readerPublicKey: Buffer, serverNonce: Buffer): Buffer {
  return hashFields(COMMIT_TAG, serverPublicKey, readerPublicKey, serverNonce);
}

export function commitmentMatches(
  expected: Buffer,
  serverPublicKey: Buffer,
  readerPublicKey: Buffer,
  serverNonce: Buffer,
): boolean {
  const actual = commitment(serverPublicKey, readerPublicKey, serverNonce);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** digest = H(tag || Pr || Ps || Nr || Ns); the code and the Lite pattern are different bytes of it. */
export function deriveCode(
  readerPublicKey: Buffer,
  serverPublicKey: Buffer,
  readerNonce: Buffer,
  serverNonce: Buffer,
): DerivedCode {
  const digest = hashFields(CODE_TAG, readerPublicKey, serverPublicKey, readerNonce, serverNonce);
  const pattern: LiteColour[] = [];
  for (let i = 0; i < LITE_SEGMENTS; i++) {
    pattern.push(LITE_COLOURS[digest.readUInt16BE(PATTERN_OFFSET + i * 2) % LITE_COLOURS.length]);
  }
  return { code: enrollmentCodeFromDigest(digest), pattern };
}
