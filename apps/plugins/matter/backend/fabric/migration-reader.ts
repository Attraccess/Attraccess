import type { PluginStorageDefinition, PluginStorageMigration } from '@attraccess/plugins-backend-sdk';
import { MATTER_STORAGE } from '../plugin-storage/tables';
import type { PluginMigrationReader } from './tokens';

const INDEX_STEPS: ReadonlySet<string> = new Set(['addIndex', 'dropIndex']);

/** True for a migration that changes the rows a backup carries; an index-only migration does not. */
const changesRows = (migration: PluginStorageMigration) =>
  migration.data !== undefined || (migration.steps ?? []).some((step) => !INDEX_STEPS.has(step.op));

/**
 * The identity of the table layout a backup file was made with and a restore needs again. The plugin has no access to
 * the host's migration bookkeeping, and does not need it: the host only loads the plugin once every migration of its
 * storage definition is applied, so the layout in use is the one the definition ends at.
 *
 * Version 1 is the baseline that adopts the layout of the last 1.x migration, and keeps that migration's name so the
 * backups made by 1.x stay restorable. Later versions are named `v<version>:<name>`. Migrations that only add or drop
 * indexes leave the rows unchanged, so they do not change the identity: backups stay restorable across them.
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
