export type AttractapSecureBootKeyRole = 'signing' | 'recovery';

/** A Secure Boot key held by this installation. */
export interface AttractapSecureBootKeyRecord {
  id: number;
  role: AttractapSecureBootKeyRole;
  publicKeyPem: string;
  /** Secure Boot v2 digest as burned into an eFuse key block, hex. */
  digest: string;
  /** SHA-256 of the SPKI, hex. */
  fingerprint: string;
  /** PKCS#8 PEM, encrypted. Null once the server no longer holds it. */
  privateKeyEncrypted: string | null;
  verifiedAt: Date | null;
  restoredAt: Date | null;
  createdAt: Date;
}

export type NewAttractapSecureBootKey = Pick<
  AttractapSecureBootKeyRecord,
  'role' | 'publicKeyPem' | 'digest' | 'fingerprint' | 'privateKeyEncrypted' | 'verifiedAt' | 'restoredAt'
>;
