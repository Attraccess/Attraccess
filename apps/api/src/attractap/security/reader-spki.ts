import { createPublicKey } from 'crypto';
import { canonicalP256Spki } from './pairing-model';

export type ReaderKeyAlgorithm = 'ecdsa-p256' | 'rsa-3072';

export const RSA_BITS = 3072;
export const RSA_PUBLIC_EXPONENT = 65537n;

/** The RSA-3072 key the DS peripheral holds, in canonical (rsaEncryption, e = 65537) SubjectPublicKeyInfo DER. */
export function canonicalRsa3072Spki(encoded: unknown): Buffer {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 1024) {
    throw new Error('invalid public key');
  }
  const der = Buffer.from(encoded, 'base64');
  return validateRsa3072Der(der);
}

export function validateRsa3072Der(der: Buffer): Buffer {
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  const details = key.asymmetricKeyDetails;
  // `rsa-pss` keys (RSASSA-PSS OID) are not what the DS peripheral produces and are refused.
  if (key.asymmetricKeyType !== 'rsa' || details?.modulusLength !== RSA_BITS) {
    throw new Error('public key is not RSA-3072');
  }
  if (details.publicExponent !== RSA_PUBLIC_EXPONENT) throw new Error('public exponent is not 65537');
  if (!(key.export({ type: 'spki', format: 'der' }) as Buffer).equals(der)) throw new Error('non-canonical public key');
  return der;
}

/** The algorithm of a canonical reader SPKI, or null when it is neither P-256 nor RSA-3072. */
export function readerKeyAlgorithm(spki: Buffer): ReaderKeyAlgorithm | null {
  try {
    const key = createPublicKey({ key: spki, format: 'der', type: 'spki' });
    if (key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1') return 'ecdsa-p256';
    if (
      key.asymmetricKeyType === 'rsa' &&
      key.asymmetricKeyDetails?.modulusLength === RSA_BITS &&
      key.asymmetricKeyDetails.publicExponent === RSA_PUBLIC_EXPONENT
    ) {
      return 'rsa-3072';
    }
  } catch {
    // not a public key
  }
  return null;
}

/** A reader key for pairing: canonical P-256 or RSA-3072. Anything else is refused. */
export async function canonicalReaderSpki(encoded: unknown): Promise<{ spki: Buffer; algorithm: ReaderKeyAlgorithm }> {
  if (typeof encoded !== 'string') throw new Error('invalid hello');
  try {
    return { spki: await canonicalP256Spki(encoded), algorithm: 'ecdsa-p256' };
  } catch {
    return { spki: canonicalRsa3072Spki(encoded), algorithm: 'rsa-3072' };
  }
}
