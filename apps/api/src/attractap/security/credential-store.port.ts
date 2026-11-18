import type {
  AttractapCredentialEventRecord,
  AttractapCredentialSnapshot,
  AttractapPairingState,
} from '@attraccess/application-models';
import type { TransactionScope } from '../../database/unit-of-work';

/** A reader's credential columns together with what the history needs to name it. */
export interface ReaderCredentialRow extends AttractapCredentialSnapshot {
  id: number;
  name: string;
}

export interface CredentialEventInput {
  readerId: number;
  readerName: string;
  keyFingerprint: string;
  certificateSerial: string | null;
  state: AttractapCredentialEventRecord['state'];
  actorId: number | null;
}

export interface CredentialPatch {
  pairingState?: AttractapPairingState;
  credentialFingerprint?: string | null;
  pairedAt?: Date | null;
  certificateNotAfter?: Date | null;
  certificateSerial?: string | null;
  apiTokenHash?: string;
}

/**
 * A reader's credential columns and the append-only credential history. The reads and writes that must happen
 * together take the unit-of-work scope of the credential change; the registry opens it.
 */
export interface AttractapCredentialStore {
  /** The credential state without a transaction (the handshake path). */
  findState(readerId: number): Promise<{ state: AttractapPairingState; fingerprint: string | null } | null>;
  findPairedReaderIdByFingerprint(fingerprint: string, scope?: TransactionScope): Promise<number | null>;
  readCredential(scope: TransactionScope, readerId: number): Promise<ReaderCredentialRow | null>;
  updateCredential(scope: TransactionScope, readerId: number, patch: CredentialPatch): Promise<void>;
  appendEvent(scope: TransactionScope, event: CredentialEventInput): Promise<void>;
  /** A new certificate for the same key; applied only while that key is still the reader's active credential. */
  updateCertificateIfActive(
    readerId: number,
    fingerprint: string,
    certificate: { serial: string; notAfter: Date },
  ): Promise<void>;
  /** Newest first. */
  history(readerId: number): Promise<AttractapCredentialEventRecord[]>;
}

export const ATTRACTAP_CREDENTIAL_STORE = Symbol.for('attraccess.attractap.credential-store');
