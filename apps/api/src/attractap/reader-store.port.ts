import type {
  AttractapFirmwareInfo,
  AttractapLinkedResource,
  AttractapReader,
  AttractapReaderEdit,
  AttractapReaderFilter,
  AttractapReaderWithResources,
} from '@attraccess/application-models';

/**
 * Readers and their linked resources. Credential columns (pairing state, fingerprint, certificate, token hash) are
 * written only by the credential store; `applyEdit` never touches them, so a concurrent pairing is not undone.
 */
export interface AttractapReaderStore {
  /** A reader with its linked resources. */
  findById(id: number): Promise<AttractapReaderWithResources | undefined>;
  /** Readers matching the filter, in storage order. Resources are loaded only when the filter asks for them. */
  list(filter?: AttractapReaderFilter): Promise<AttractapReader[]>;
  /** Readers that are not paired (the pairing session's list), with their linked resources. */
  listUnpaired(): Promise<AttractapReader[]>;
  create(input: { apiTokenHash: string; name: string; firmware?: AttractapFirmwareInfo }): Promise<AttractapReader>;
  /** The resources that exist among the given ids. */
  findResourcesByIds(ids: number[]): Promise<AttractapLinkedResource[]>;
  /** Saves name, brightness, firmware and linked resources; credentials stay as they are. */
  applyEdit(id: number, edit: AttractapReaderEdit): Promise<void>;
  recordConnection(id: number, at: Date): Promise<void>;
  /** True when a reader was deleted. */
  delete(id: number): Promise<boolean>;
}

export const ATTRACTAP_READER_STORE = Symbol.for('attraccess.attractap.reader-store');
