import type { TransactionScope } from '../database/unit-of-work';

/**
 * The transaction a setting is read through. A unit-of-work scope; audit still passes its own transaction handle
 * until it uses the unit of work, hence the open `object`.
 */
export type SettingsReadContext = TransactionScope | object;

/** Persistence of the key/value settings rows and of the account counts the first-time setup status needs. */
export const SETTINGS_ROWS = Symbol.for('attraccess.settings.rows');

export interface SettingsRows {
  /** The stored value of one setting, or null when no row exists. With a context the read joins its transaction. */
  findValue(parent: string, key: string, context?: SettingsReadContext): Promise<string | null>;
  /** Creates the row or replaces its value (single statements, so the write lock is held briefly). */
  upsertValue(parent: string, key: string, value: string): Promise<void>;
  remove(parent: string, key: string): Promise<void>;
}

export const SETUP_ACCOUNT_STATS = Symbol.for('attraccess.settings.setup-account-stats');

export interface SetupAccountStats {
  countAccounts(): Promise<number>;
  countVerifiedAccounts(): Promise<number>;
}
