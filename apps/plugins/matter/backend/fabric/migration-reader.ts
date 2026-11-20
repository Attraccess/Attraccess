import type {
  PluginStorageDefinition,
  PluginStorageMigration,
  PluginStorageMigrationStep,
} from '@attraccess/plugins-backend-sdk';
import { MATTER_STORAGE } from '../plugin-storage/tables';
import type { PluginMigrationReader } from './tokens';

/**
 * A plain (non-unique) index changes no rule a backup's rows must satisfy. A unique index, or dropping any index (it
 * may have been unique), does: a backup from one side could violate the other side's constraints.
 */
const isPlainIndexAdd = (step: PluginStorageMigrationStep) => step.op === 'addIndex' && step.index.unique !== true;

/** True for a migration that changes the rows a backup carries or the rules they meet; a plain index does not. */
const changesRows = (migration: PluginStorageMigration) =>
  migration.data !== undefined || (migration.steps ?? []).some((entry) => !isPlainIndexAdd(entry));

/**
 * The identity of the table layout a backup file was made with and a restore needs again. The plugin has no access to
 * the host's migration bookkeeping, and does not need it: the host only loads the plugin once every migration of its
 * storage definition is applied, so the layout in use is the one the definition ends at.
 *
 * Version 1 is the baseline that adopts the layout of the last 1.x migration, and keeps that migration's name so the
 * backups made by 1.x stay restorable. Later versions are named `v<version>:<name>`. Migrations that only add plain
 * (non-unique) indexes leave the rows and their rules unchanged, so they do not change the identity: backups stay
 * restorable across them.
 */
export function storageSchemaName(): string {
  return schemaNameOf(MATTER_STORAGE);
}

/** {@link storageSchemaName} of a given storage definition. */
export function schemaNameOf(definition: PluginStorageDefinition): string {
  const last = definition.migrations.filter(changesRows).at(-1) ?? definition.migrations[0];
  return last.version === 1
    ? (definition.adoption?.legacyMigrations.at(-1) as string)
    : `v${last.version}:${last.name}`;
}

/** Reads the layout identity of this installation. */
export function storageSchemaReader(): PluginMigrationReader {
  return async () => storageSchemaName();
}
