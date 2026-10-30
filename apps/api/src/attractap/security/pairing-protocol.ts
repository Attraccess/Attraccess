import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/** Numeric-comparison pairing (the Bluetooth LE pattern): commit, reveal, compare. */
const COMMIT_TAG = 'attractap-pairing-commit-v1';
const CODE_TAG = 'attractap-pairing-code-v1';
export const NONCE_BYTES = 16;

export const LITE_COLOURS = ['red', 'green', 'blue', 'yellow', 'white', 'magenta'] as const;
export type LiteColour = (typeof LITE_COLOURS)[number];
export const LITE_SEGMENTS = 8;

export type PairingCode = { kind: 'digits'; value: string } | { kind: 'colours'; value: LiteColour[] };

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

/** H(tag || Pr || Ps || Nr || Ns), reduced to 6 digits or 8 colours. */
export function deriveCode(
  kind: 'touch' | 'lite',
  readerPublicKey: Buffer,
  serverPublicKey: Buffer,
  readerNonce: Buffer,
  serverNonce: Buffer,
): PairingCode {
  const digest = hashFields(CODE_TAG, readerPublicKey, serverPublicKey, readerNonce, serverNonce);
  if (kind === 'touch') {
    return { kind: 'digits', value: String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0') };
  }
  const colours: LiteColour[] = [];
  for (let i = 0; i < LITE_SEGMENTS; i++) colours.push(LITE_COLOURS[digest.readUInt16BE(i * 2) % LITE_COLOURS.length]);
  return { kind: 'colours', value: colours };
}
