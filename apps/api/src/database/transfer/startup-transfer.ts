import { Logger } from '@nestjs/common';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { resolveDatabasePath } from '../../config/storage-path';
import type { LoadedPluginManifest } from '../../plugin-system/plugin.manifest';
import { PluginMigrationService } from '../../plugin-system/plugin-migration.service';
import { PluginService } from '../../plugin-system/plugin.service';
import { UPGRADE_DOCS_URL } from '../backend/database-type';
import { resolveDatabaseBackend } from '../backend/resolve-database-backend';
import { postgresBackend } from '../postgres/postgres-backend';
import {
  acquireAdvisoryLock,
  POSTGRES_MIGRATION_LOCK_KEY,
  SQLITE_TRANSFER_LOCK_KEY,
} from '../postgres/postgres-advisory-lock';
import { parsePostgresConfig, redactDatabaseUrl, type PostgresConfig } from '../postgres/postgres-config';
import { waitForPostgres } from '../postgres/postgres-connection';
import { MissingTargetStorageError } from '../postgres/postgres-transfer';
import type { PluginDescriptor } from '../transfer-snapshot';
import { describeMissingPluginData } from './missing-plugin-tables';
import { assertNoRunningApi, logReplacedTables, TRANSFER_APPLICATION_NAME } from './replace-target';
import { fileExists } from './sqlite-working-copy';
import { transferSqliteToPostgres } from './sqlite-to-postgres';
import { SqliteTransferError } from './transfer-errors';

const logger = new Logger('SqliteTransfer');

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
  if (!(error instanceof SqliteTransferError) || !(error.cause instanceof MissingTargetStorageError)) return error;
  const { reason, subject, tables } = error.cause;
  let detail: string;
  if (reason === 'missing-table' && tables.length > 0) {
    detail = describeMissingPluginData(tables, unloadable);
  } else {
    const which = reason === 'missing-plugin' ? `plugin ${subject}` : `table ${subject}`;
    const hint = unloadable.length
      ? `; plugins that could not be loaded: ${unloadable.map((p) => `${p.name} (${p.reason})`).join(', ')}`
      : '';
    detail =
      `the SQLite data holds data of a plugin that is not installed or not loadable (${which}). ` +
      `Install that plugin's build for this Attraccess version in the plugin directory first${hint}`;
  }
  return new SqliteTransferError('importing into PostgreSQL', detail, { cause: error, outcome: error.outcome });
}

/** A connection of its own for startup work: no entities, migrations run only when asked. */
function openStartupSource(applicationName?: string): DataSource {
  const backend = resolveDatabaseBackend();
  const base = backend.createDataSourceOptions() as DataSourceOptions & { extra?: Record<string, unknown> };
  return backend.createDataSource({
    ...base,
    entities: [],
    migrationsRun: false,
    extra: applicationName ? { ...base.extra, application_name: applicationName } : base.extra,
  } as DataSourceOptions);
}

/**
 * Applies the pending core migrations while holding the migration lock: instances that start together take turns,
 * and the later ones find nothing pending. TypeORM itself takes no lock.
 */
async function runMigrationsLocked(config: PostgresConfig, source: DataSource): Promise<void> {
  const lock = await acquireAdvisoryLock(config, POSTGRES_MIGRATION_LOCK_KEY);
  try {
    await source.runMigrations();
  } finally {
    await lock.release();
  }
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
  resolveDatabaseBackend();
  const config = parsePostgresConfig();
  const { sqliteFile } = options;
  // Lock order: the transfer lock, then (for the migrations) the migration lock; never the other way round.
  const lock = await acquireAdvisoryLock(config, SQLITE_TRANSFER_LOCK_KEY);
  let source: DataSource | undefined;
  try {
    // Another instance may have transferred while this one waited for the lock.
    if (!(await fileExists(sqliteFile))) return false;
    source = openStartupSource(TRANSFER_APPLICATION_NAME);
    await source.initialize();
    if (options.whenTargetHasData === 'replace') await assertNoRunningApi(source);
    await runMigrationsLocked(config, source);
    if (options.whenTargetHasData !== 'replace' && (await postgresHasUserData(source))) {
      if (options.whenTargetHasData === 'refuse') {
        throw new SqliteTransferError(
          'checking the target',
          'the PostgreSQL database already holds data; pass --force to replace it with the SQLite data',
          { outcome: 'refused' },
        );
      }
      logger.warn(
        `${sqliteFile} exists, but the PostgreSQL database already holds data; the SQLite file is ignored and not ` +
          `transferred. Remove or rename it once you are sure PostgreSQL has your data. See ${UPGRADE_DOCS_URL}.`,
      );
      return false;
    }
    if (options.whenTargetHasData === 'replace') await logReplacedTables(source, logger);
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

/** Applies the pending core migrations on a connection of its own, under the migration lock. */
async function migrateAtStartup(config: PostgresConfig): Promise<void> {
  const source = openStartupSource();
  await source.initialize();
  try {
    await runMigrationsLocked(config, source);
  } finally {
    await source.destroy().catch(() => undefined);
  }
}

/** Whether the SQLite file is there. A storage directory that cannot be read stops the start instead of hiding it. */
async function sqliteFilePresent(sqliteFile: string): Promise<boolean> {
  try {
    return await fileExists(sqliteFile);
  } catch (error) {
    throw new SqliteTransferError('looking for the SQLite file', (error as Error).message, {
      cause: error,
      outcome: 'refused',
    });
  }
}

/**
 * Runs before the application connection opens, before any plugin starts and before HTTP or devices are accepted:
 * waits for PostgreSQL, applies the pending core migrations under the migration lock (so instances that start
 * together never run one twice; the application connection then finds nothing pending) and moves the data of an
 * existing SQLite installation when the database holds no Attraccess data yet. No SQLite file, or data already in
 * PostgreSQL: nothing is transferred. SKIP_DATABASE_MIGRATIONS=true (a process that never uses the database): nothing.
 */
export async function prepareDatabaseAtStartup(): Promise<void> {
  if (process.env.SKIP_DATABASE_MIGRATIONS === 'true') return;
  resolveDatabaseBackend();
  const config = parsePostgresConfig();
  logger.log(`Database: PostgreSQL ${redactDatabaseUrl(config.url)} (schema ${config.schema})`);
  await waitForPostgres(config);
  const sqliteFile = resolveDatabasePath();
  const transfer = await sqliteFilePresent(sqliteFile);
  await migrateAtStartup(config);
  if (!transfer) return;
  await runTransfer({ sqliteFile, whenTargetHasData: 'skip' });
}
