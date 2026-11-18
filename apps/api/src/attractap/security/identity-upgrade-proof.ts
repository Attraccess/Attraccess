import { constants, createPublicKey, verify } from 'crypto';

/** Domain separator of the identity upgrade proof; never reuse it for another signature. */
export const IDENTITY_UPGRADE_DOMAIN = 'attractap-identity-upgrade-v1';
export const PSS_SALT_BYTES = 32;

export interface ProofFields {
  installationId: string;
  readerId: number;
  /** Raw 32-byte SHA-256 of the old SPKI DER. */
  oldFingerprint: Buffer;
  newSpki: Buffer;
  nonce: Buffer;
}

function field(value: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(value.length);
  return Buffer.concat([length, value]);
}

/** The byte string the reader signs: each field as u32 big-endian length + bytes, in a fixed order. */
export function buildProofTuple(fields: ProofFields): Buffer {
  return Buffer.concat([
    field(Buffer.from(IDENTITY_UPGRADE_DOMAIN, 'ascii')),
    field(Buffer.from(fields.installationId, 'utf8')),
    field(Buffer.from(String(fields.readerId), 'ascii')),
    field(fields.oldFingerprint),
    field(fields.newSpki),
    field(fields.nonce),
  ]);
}

/** RSA-PSS SHA-256 (MGF1-SHA256, salt length exactly 32). PKCS#1 v1.5 signatures never verify. */
export function verifyProof(spki: Buffer, tuple: Buffer, proof: Buffer): boolean {
  try {
    return verify(
      'sha256',
      tuple,
      {
        key: createPublicKey({ key: spki, format: 'der', type: 'spki' }),
        padding: constants.RSA_PKCS1_PSS_PADDING,
        saltLength: PSS_SALT_BYTES,
      },
      proof,
    );
  } catch {
    return false;
  }
}
