import { MATTER_STORAGE } from '../plugin-storage/tables';
import type { PluginMigrationReader } from './tokens';

/**
 * The identity of the table layout a backup file was made with and a restore needs again. The plugin has no access to
 * the host's migration bookkeeping, and does not need it: the host only loads the plugin once every migration of its
 * storage definition is applied, so the layout in use is the one the definition ends at.
 *
 * Version 1 is the baseline that adopts the layout of the last 1.x migration, and keeps that migration's name so the
 * backups made by 1.x stay restorable. Later versions are named `v<version>:<name>`.
 */
export function storageSchemaName(): string {
  const last = MATTER_STORAGE.migrations[MATTER_STORAGE.migrations.length - 1];
  return last.version === 1
    ? (MATTER_STORAGE.adoption?.legacyMigrations.at(-1) as string)
    : `v${last.version}:${last.name}`;
}

/** Reads the layout identity of this installation. */
export function storageSchemaReader(): PluginMigrationReader {
  return async () => storageSchemaName();
}
