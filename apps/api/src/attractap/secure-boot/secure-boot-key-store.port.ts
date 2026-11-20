import type {
  AttractapReader,
  AttractapSecureBootKeyRecord,
  NewAttractapSecureBootKey,
  AttractapSecureBootKeyRole,
} from '@attraccess/application-models';
import type { TransactionScope } from '../../database/unit-of-work';

/** Secure Boot keys of the installation and the question which readers have a digest burned. */
export interface AttractapSecureBootKeyStore {
  latest(role: AttractapSecureBootKeyRole): Promise<AttractapSecureBootKeyRecord | null>;
  count(): Promise<number>;
  findByDigest(digest: string): Promise<AttractapSecureBootKeyRecord | null>;
  /** Keys whose private part the server still holds, newest first. */
  listWithPrivateKey(): Promise<AttractapSecureBootKeyRecord[]>;
  /** Readers with any digest burned, or with the given one (hex may arrive in any case). */
  countReadersWithBurnedDigest(digest?: string): Promise<number>;
  /** Removes the keys of one role, or every key when no role is given. */
  remove(scope: TransactionScope, role?: AttractapSecureBootKeyRole): Promise<void>;
  insert(scope: TransactionScope, key: NewAttractapSecureBootKey): Promise<AttractapSecureBootKeyRecord>;
  /** The recovery check passed: the private part is dropped and the proof time recorded. */
  markRecoveryVerified(id: number, verifiedAt: Date): Promise<void>;
}

export type SecureBootReaderDigests = Pick<
  AttractapReader,
  'secureBootDigest0' | 'secureBootDigest1' | 'secureBootSignerDigest'
>;

export const ATTRACTAP_SECURE_BOOT_KEY_STORE = Symbol.for('attraccess.attractap.secure-boot-key-store');
