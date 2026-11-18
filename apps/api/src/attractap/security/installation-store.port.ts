import type { AttractapInstallationRecord } from '@attraccess/application-models';

/** The singleton row that holds the installation identity. */
export interface AttractapInstallationStore {
  find(): Promise<AttractapInstallationRecord | null>;
  /** Creates or replaces the installation identity. */
  save(record: AttractapInstallationRecord): Promise<AttractapInstallationRecord>;
}

export const ATTRACTAP_INSTALLATION_STORE = Symbol.for('attraccess.attractap.installation-store');
