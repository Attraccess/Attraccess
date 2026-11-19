import { Logger } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import type { DataSource } from 'typeorm';
import { resolveDatabasePath } from '../../config/storage-path';
import type { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
import { PluginMigrationService } from '../../plugin-system/plugin-migration.service';
import { PluginService } from '../../plugin-system/plugin.service';
import { UPGRADE_DOCS_URL } from '../backend/database-type';
import { resolveDatabaseBackend } from '../backend/resolve-database-backend';
import { postgresBackend } from '../postgres/postgres-backend';
import { acquireAdvisoryLock, SQLITE_TRANSFER_LOCK_KEY } from '../postgres/postgres-advisory-lock';
import { parsePostgresConfig, redactDatabaseUrl } from '../postgres/postgres-config';
import { waitForPostgres } from '../postgres/postgres-connection';
import type { PluginDescriptor } from '../transfer-snapshot';
import { SqliteTransferError } from './transfer-errors';
import { transferSqliteToPostgres } from './sqlite-to-postgres';

const logger = new Logger('SqliteTransfer');

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/** Whether the target holds Attraccess data: any user or resource. A freshly applied baseline holds none. */
export async function postgresHasUserData(source: Pick<DataSource, 'query'>): Promise<boolean> {
  const tables: { table_name: string }[] = await source.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name IN ('user', 'resource')`,
  );
  for (const { table_name: table } of tables) {
    const rows = await source.query(`SELECT 1 FROM "${table}" LIMIT 1`);
    if (rows.length > 0) return true;
  }
  return false;
}

export interface DiscoveredPlugins {
  readonly descriptors: PluginDescriptor[];
  /** Installed plugins whose storage declaration could not be loaded. */
  readonly unloadable: { name: string; reason: string }[];
}

/** The installed plugins with declared storage, read from PLUGIN_DIR before any plugin starts. */
export function discoverStoragePlugins(manifests: readonly LoadedPluginManifest[]): DiscoveredPlugins {
  const descriptors: PluginDescriptor[] = [];
  const unloadable: { name: string; reason: string }[] = [];
  for (const manifest of manifests) {
    if (!PluginMigrationService.hasStorage(manifest)) continue;
    try {
      const storage = PluginMigrationService.loadStorage(manifest);
      if (storage) descriptors.push({ id: manifest.name, version: manifest.version, storage });
    } catch (error) {
      unloadable.push({ name: manifest.name, reason: (error as Error).message });
    }
  }
  return { descriptors, unloadable };
}

/** Explains a refused import when the SQLite data holds plugin tables that no loadable installed plugin declares. */
export function explainMissingPlugin(error: unknown, unloadable: DiscoveredPlugins['unloadable']): unknown {
  const message = error instanceof Error ? error.message : '';
  if (!(error instanceof SqliteTransferError) || !/has no table|is not installed/.test(message)) return error;
  // The cause names the missing table or plugin, for example "The database has no table reservations_reservation".
  const reason = error.cause instanceof Error ? error.cause.message.replace(/^\w+Error: /, '') : '';
  const hint = unloadable.length
    ? `; plugins that could not be loaded: ${unloadable.map((p) => `${p.name} (${p.reason})`).join(', ')}`
    : '';
  return new SqliteTransferError(
    'importing into PostgreSQL',
    `the SQLite data holds data of a plugin that is not installed or not loadable${reason ? ` (${reason})` : ''}. ` +
      `Install that plugin in the plugin directory first, in the same version as before${hint}`,
    { cause: error },
  );
}

export interface RunTransferOptions {
  readonly sqliteFile: string;
  /** What to do when PostgreSQL already holds data: leave both alone (startup) or refuse with an error (command). */
  readonly whenTargetHasData: 'skip' | 'refuse' | 'replace';
  /** Keep the SQLite file under its name instead of renaming it after success. */
  readonly keepFile?: boolean;
}

/**
 * Takes the transfer lock, applies the baseline and moves the SQLite data into PostgreSQL in one transaction.
 * Returns false when nothing was transferred because another instance did it first, or the target holds data.
 */
export async function runTransfer(options: RunTransferOptions): Promise<boolean> {
  const backend = resolveDatabaseBackend();
  const config = parsePostgresConfig();
  const { sqliteFile } = options;
  const lock = await acquireAdvisoryLock(config, SQLITE_TRANSFER_LOCK_KEY);
  let source: DataSource | undefined;
  try {
    // Another instance may have transferred while this one waited for the lock.
    if (!(await exists(sqliteFile))) return false;
    source = backend.createDataSource({
      ...backend.createDataSourceOptions(),
      entities: [],
      migrationsRun: false,
    });
    await source.initialize();
    await source.runMigrations();
    if (options.whenTargetHasData !== 'replace' && (await postgresHasUserData(source))) {
      if (options.whenTargetHasData === 'refuse') {
        throw new SqliteTransferError(
          'checking the target',
          'the PostgreSQL database already holds data; pass --force to replace it with the SQLite data',
        );
      }
      logger.warn(
        `${sqliteFile} exists, but the PostgreSQL database already holds data; the SQLite file is ignored and not ` +
          `transferred. Remove or rename it once you are sure PostgreSQL has your data. See ${UPGRADE_DOCS_URL}.`,
      );
      return false;
    }
    const discovered = discoverStoragePlugins(PluginService.getPlugins());
    try {
      await transferSqliteToPostgres({
        sqliteFile,
        target: source,
        plugins: discovered.descriptors,
        targetPluginEngine: postgresBackend.plugins.createMigrationEngine(null),
        logger,
        markMigrated: !options.keepFile,
      });
    } catch (error) {
      throw explainMissingPlugin(error, discovered.unloadable);
    }
    return true;
  } finally {
    if (source?.isInitialized) await source.destroy().catch(() => undefined);
    await lock.release();
  }
}

/**
 * Runs before migrations finish serving, before any plugin starts and before HTTP or devices are accepted: waits for
 * PostgreSQL and moves the data of an existing SQLite installation when the database holds no Attraccess data yet. No
 * SQLite file, or data already in PostgreSQL: nothing is transferred.
 */
export async function prepareDatabaseAtStartup(): Promise<void> {
  resolveDatabaseBackend();
  const config = parsePostgresConfig();
  logger.log(`Database: PostgreSQL ${redactDatabaseUrl(config.url)} (schema ${config.schema})`);
  await waitForPostgres(config);
  const sqliteFile = resolveDatabasePath();
  if (!(await exists(sqliteFile))) return;
  await runTransfer({ sqliteFile, whenTargetHasData: 'skip' });
}
