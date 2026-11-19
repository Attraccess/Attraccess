import type {
  AttractapFirmwareInfo,
  AttractapLinkedResource,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderSecurity,
  AttractapReaderSecurityPatch,
  AttractapReaderWithResources,
} from '@attraccess/application-models';

/**
 * Readers and their linked resources. Credential columns (pairing state, fingerprint, certificate) are
 * written only by the credential store; `applyEdit` never touches them, so a concurrent pairing is not undone.
 */
export interface AttractapReaderStore {
  /** A reader with its linked resources. */
  findById(id: number): Promise<AttractapReaderWithResources | undefined>;
  /** Readers matching the filter, in storage order. Resources are loaded only when the filter asks for them. */
  list(filter?: AttractapReaderFilter): Promise<AttractapReader[]>;
  /** Readers whose pairing was removed (the pairing session's list), with their linked resources. */
  listRevoked(): Promise<AttractapReader[]>;
  /** A record without a credential (pairing state `revoked`). */
  create(input: { name: string; firmware?: AttractapFirmwareInfo }): Promise<AttractapReader>;
  /** The resources that exist among the given ids. */
  findResourcesByIds(ids: number[]): Promise<AttractapLinkedResource[]>;
  /** Only the security columns and recorded Secure Boot digests of a reader: a narrow read, no resources. */
  findSecurity(id: number): Promise<AttractapReaderSecurity | undefined>;
  /**
   * Writes the security columns only (firmware profile, eFuse report result, secured); nothing else changes.
   * With `whenCredential` the write happens only while the reader is paired with that key, so a report of a
   * session whose key was revoked or replaced meanwhile cannot mark the reader secured. False when it did not apply.
   */
  applySecurity(id: number, patch: AttractapReaderSecurityPatch, whenCredential?: string): Promise<boolean>;
  /** Saves name, brightness, firmware and linked resources; credentials stay as they are. */
  applyEdit(id: number, edit: AttractapReaderEdit): Promise<void>;
  recordConnection(id: number, at: Date): Promise<void>;
  /** True when a reader was deleted. */
  delete(id: number): Promise<boolean>;
}

export const ATTRACTAP_READER_STORE = Symbol.for('attraccess.attractap.reader-store');
