import type { DataSource } from 'typeorm';
import type { PluginMigrationEngine } from '../../plugin-system/persistence/plugin-migration-engine.port';
import { postgresBackend } from '../postgres/postgres-backend';
import { postgresIntegrityViolations } from '../postgres/postgres-transfer';
import { createSqlitePluginMigrationEngine } from '../sqlite/sqlite-plugin-migrations';
import { migrateFrozenSqlite, openFrozenSqlite, sqliteFrozenTrack } from '../sqlite/sqlite-frozen-track';
import { createSqliteTransfer } from '../sqlite/sqlite-transfer';
import type { DatabaseSnapshot, PluginDescriptor } from '../transfer-snapshot';
import { SqliteTransferError, safeDetail } from './transfer-errors';
import { copyToWorkingDirectory, markMigrated } from './sqlite-working-copy';

export interface TransferLog {
  log(message: string): void;
  warn(message: string): void;
}

export interface SqliteToPostgresOptions {
  /** The SQLite database of the installation. Never modified, except for the final rename. */
  readonly sqliteFile: string;
  /** An initialized PostgreSQL connection whose schema is at the current release (the baseline applied). */
  readonly target: DataSource;
  /** The installed plugins with declared storage, discovered before the import. */
  readonly plugins: readonly PluginDescriptor[];
  /** Brings a plugin's tables on the target to the installed plugin's storage version. */
  readonly targetPluginEngine: PluginMigrationEngine;
  readonly logger: TransferLog;
  /** Rename the SQLite file on success. Default true. */
  readonly markMigrated?: boolean;
  readonly now?: () => Date;
}

export interface TransferSummary {
  readonly tables: Readonly<Record<string, number>>;
  readonly totalRows: number;
  readonly plugins: readonly string[];
  readonly renamedTo?: string;
  readonly warnings: readonly string[];
}

async function step<T>(name: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SqliteTransferError) throw error;
    throw new SqliteTransferError(name, safeDetail(error), { cause: error });
  }
}

/** Exports the SQLite database through a private working copy: the original file is only read. */
export async function exportSqliteSnapshot(
  sqliteFile: string,
  plugins: readonly PluginDescriptor[],
  logger: TransferLog,
): Promise<DatabaseSnapshot> {
  const copy = await step('copying the SQLite file', () => copyToWorkingDirectory(sqliteFile));
  try {
    const source = await step('opening the working copy', () => openFrozenSqlite(copy.file));
    try {
      const ran = await step('applying the released SQLite migrations to the copy', () => migrateFrozenSqlite(source));
      logger.log(`Brought the working copy up to the last SQLite migration (${ran.length} migration(s) applied).`);
    } finally {
      await source.destroy();
    }
    const sqliteEngine = createSqlitePluginMigrationEngine(copy.file);
    for (const plugin of plugins) {
      await step(`migrating the storage of plugin ${plugin.id} in the copy`, () =>
        sqliteEngine.migrate(plugin.storage),
      );
    }
    const reader = await step('opening the working copy', () => openFrozenSqlite(copy.file));
    try {
      return await step('exporting the SQLite data', () =>
        createSqliteTransfer(sqliteFrozenTrack).exportSnapshot(reader, { plugins }),
      );
    } finally {
      await reader.destroy();
    }
  } finally {
    await copy.remove();
  }
}

/**
 * Moves the data of a SQLite installation into the PostgreSQL database in one transaction. On any failure nothing is
 * imported (the PostgreSQL transaction rolls back) and the SQLite file is untouched, so a retry is safe.
 */
export async function transferSqliteToPostgres(options: SqliteToPostgresOptions): Promise<TransferSummary> {
  const { logger, plugins, target } = options;
  logger.log('Transferring SQLite data to PostgreSQL...');
  const snapshot = await exportSqliteSnapshot(options.sqliteFile, plugins, logger);

  for (const plugin of plugins) {
    await step(`preparing the storage of plugin ${plugin.id} in PostgreSQL`, () =>
      options.targetPluginEngine.migrate(plugin.storage),
    );
  }
  await step('importing into PostgreSQL', () => postgresBackend.transfer.importSnapshot(target, snapshot, { plugins }));

  const warnings = await step('checking the imported data', () => postgresIntegrityViolations(target));
  for (const warning of warnings) logger.warn(`Integrity check: ${warning}`);

  const tables: Record<string, number> = {};
  let totalRows = 0;
  for (const table of snapshot.tables) {
    if (table.name === 'migrations' || table.name === 'typeorm_metadata' || table.rows.length === 0) continue;
    tables[table.name] = table.rows.length;
    totalRows += table.rows.length;
  }
  logger.log(`SQLite -> PostgreSQL transfer complete: ${totalRows} rows in ${Object.keys(tables).length} tables.`);
  for (const [name, count] of Object.entries(tables)) logger.log(`  ${name}: ${count}`);

  let renamedTo: string | undefined;
  if (options.markMigrated !== false) {
    renamedTo = await step('renaming the SQLite file', () => markMigrated(options.sqliteFile, options.now?.()));
    logger.log(`The SQLite file was kept as ${renamedTo}. It is no longer used and can be deleted once you are sure.`);
  }
  return { tables, totalRows, plugins: plugins.map((plugin) => plugin.id), renamedTo, warnings };
}
