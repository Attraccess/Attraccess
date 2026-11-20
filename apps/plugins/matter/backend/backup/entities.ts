// Row types of the backup feature. The tables are declared in `../plugin-storage/tables.ts`.
import type { PluginStorageRow } from '@attraccess/plugins-backend-sdk';
import type { MATTER_TABLES } from '../plugin-storage/tables';

export type BackupTrigger = 'manual' | 'fabric_created' | 'restore' | 'daily' | 'fabric_changed' | 'pre_restore';
export const BACKUP_TRIGGERS: readonly BackupTrigger[] = [
  'manual',
  'fabric_created',
  'restore',
  'daily',
  'fabric_changed',
  'pre_restore',
];

type Tables = typeof MATTER_TABLES;

/**
 * A recovery key. Only `encryptedKey` (encrypted with the host's plugin secrets) is stored, never the key itself.
 * `retiredAt` is set when the key was rotated out; the current key is the one without it.
 */
export type MatterRecoveryKey = PluginStorageRow<Tables['recoveryKeys']>;

/**
 * One backup attempt. A successful one carries the encrypted file in `blob` (see `plugin-storage/blob.ts`); a failed one only
 * a non-secret `reason` code. Never part of a backup itself. `actor` is the administrator who asked for it (null for
 * the plugin's own scheduled and event-driven backups). `consistent` is `false` for a backup whose plugin tables did
 * not agree with the sidecar snapshot (a pre-restore backup taken in recovery); the same flag is in the file's
 * authenticated header. Null for a failed attempt.
 */
export type MatterBackup = Omit<PluginStorageRow<Tables['backups']>, 'trigger' | 'outcome'> & {
  trigger: BackupTrigger;
  outcome: 'succeeded' | 'failed';
};
