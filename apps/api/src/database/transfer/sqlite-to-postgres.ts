import type { DataSource } from 'typeorm';
import type { PluginMigrationEngine } from '../../plugin-system/persistence/plugin-migration-engine.port';
import {
  legacyMigrationsTableName,
  PluginStorageMigrationRefused,
} from '../../plugin-system/plugin-storage/storage-model';
import { postgresBackend } from '../postgres/postgres-backend';
import { ENGINE_BOOKKEEPING, postgresIntegrityViolations, userTables } from '../postgres/postgres-transfer';
import { createSqlitePluginMigrationEngine } from '../sqlite/sqlite-plugin-migrations';
import { migrateFrozenSqlite, openFrozenSqlite, sqliteFrozenTrack } from '../sqlite/sqlite-frozen-track';
import { createSqliteTransfer } from '../sqlite/sqlite-transfer';
import type { DatabaseSnapshot, PluginDescriptor } from '../transfer-snapshot';
import { SqliteTransferError, safeDetail, type TransferFailureOutcome } from './transfer-errors';
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

async function step<T>(
  name: string,
  work: () => Promise<T>,
  outcome: TransferFailureOutcome = 'rolled-back',
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof SqliteTransferError) throw error;
    throw new SqliteTransferError(name, safeDetail(error), { cause: error, outcome });
  }
}

/**
 * The 1.x TypeORM history (`plugin_migrations_<name>`) of an installed plugin was adopted into the plugin's storage
 * bookkeeping on the copy, which the snapshot carries; the target engine never reads it, so it stays behind.
 */
function withoutAdoptedHistories(snapshot: DatabaseSnapshot, plugins: readonly PluginDescriptor[]): DatabaseSnapshot {
  const histories = new Set(plugins.map((plugin) => legacyMigrationsTableName(plugin.storage.pluginName)));
  return { ...snapshot, tables: snapshot.tables.filter((table) => !histories.has(table.name)) };
}

/**
 * The working copy holds a plugin history this release will not adopt (a partial 1.x history). Retrying never helps:
 * the SQLite file has to go through the last 1.x release first. It was only read, so no backup needs restoring.
 */
function refusedOnCopy(name: string, error: PluginStorageMigrationRefused): SqliteTransferError {
  const detail = error.message.replace(
    'Restore the backup taken before this upgrade, update to',
    'The SQLite file was not changed and needs no restore: update to',
  );
  return new SqliteTransferError(name, detail, { cause: error, outcome: 'refused' });
}

/**
 * Tables of the SQLite data that the target lacks (no installed plugin creates them) but that hold no row are left
 * behind with a warning: there is nothing to lose. Tables with rows stay in the snapshot, and the import refuses them,
 * naming every one.
 */
async function withoutEmptyLeftovers(
  target: DataSource,
  snapshot: DatabaseSnapshot,
  logger: TransferLog,
): Promise<DatabaseSnapshot> {
  const existing = new Set(await userTables(target));
  const leftovers = snapshot.tables.filter(
    (table) => table.rows.length === 0 && !existing.has(table.name) && !ENGINE_BOOKKEEPING.has(table.name),
  );
  if (leftovers.length === 0) return snapshot;
  const names = new Set(leftovers.map((table) => table.name));
  logger.warn(
    `Not imported: empty tables of the SQLite data that no installed plugin creates: ${[...names].join(', ')}.`,
  );
  return { ...snapshot, tables: snapshot.tables.filter((table) => !names.has(table.name)) };
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
      const name = `migrating the storage of plugin ${plugin.id} in the copy`;
      await step(name, () =>
        sqliteEngine.migrate(plugin.storage).catch((error: unknown) => {
          throw error instanceof PluginStorageMigrationRefused ? refusedOnCopy(name, error) : error;
        }),
      );
    }
    const reader = await step('opening the working copy', () => openFrozenSqlite(copy.file));
    try {
      const snapshot = await step('exporting the SQLite data', () =>
        createSqliteTransfer(sqliteFrozenTrack).exportSnapshot(reader, { plugins }),
      );
      return withoutAdoptedHistories(snapshot, plugins);
    } finally {
      await reader.destroy();
    }
  } finally {
    await copy.remove();
  }
}

/** Derived data that disagrees after the commit is reported, never repaired: the data is in PostgreSQL either way. */
async function checkImportedData(target: DataSource, logger: TransferLog): Promise<string[]> {
  try {
    const warnings = (await postgresIntegrityViolations(target)).map((problem) => `Integrity check: ${problem}`);
    for (const warning of warnings) logger.warn(warning);
    return warnings;
  } catch (error) {
    const warning =
      `The data was transferred to PostgreSQL, but the integrity check after the import could not run: ` +
      `${safeDetail(error)}. Compare the credit balances of the users with their transactions.`;
    logger.warn(warning);
    return [warning];
  }
}

/** After the commit: a file that cannot be renamed is reported, and the API continues on the transferred data. */
async function renameSqliteFile(options: SqliteToPostgresOptions): Promise<{ renamedTo?: string; warning?: string }> {
  try {
    const renamedTo = await markMigrated(options.sqliteFile, options.now?.());
    options.logger.log(
      `The SQLite file was kept as ${renamedTo}. It is no longer used and can be deleted once you are sure.`,
    );
    return { renamedTo };
  } catch (error) {
    const warning =
      `The data was transferred to PostgreSQL, but renaming ${options.sqliteFile} failed: ${safeDetail(error)}. ` +
      `Rename or remove the SQLite file (and its -journal, -wal and -shm files) yourself; it will be ignored on ` +
      `the next start because PostgreSQL now holds the data.`;
    options.logger.warn(warning);
    return { warning };
  }
}

/**
 * Moves the data of a SQLite installation into the PostgreSQL database in one transaction. A failure before the
 * commit imports nothing (the PostgreSQL transaction rolls back) and leaves the SQLite file untouched, so a retry is
 * safe; the storage tables of installed plugins prepared before the import stay and are reused by the retry. After
 * the commit the transfer counts as done: a failed integrity check or rename is a warning.
 */
export async function transferSqliteToPostgres(options: SqliteToPostgresOptions): Promise<TransferSummary> {
  const { logger, plugins, target } = options;
  logger.log('Transferring SQLite data to PostgreSQL...');
  const snapshot = await exportSqliteSnapshot(options.sqliteFile, plugins, logger);

  // Each plugin's storage is prepared in its own transaction, before the import transaction opens.
  const outcome: TransferFailureOutcome = plugins.length > 0 ? 'plugin-storage-kept' : 'rolled-back';
  for (const plugin of plugins) {
    await step(
      `preparing the storage of plugin ${plugin.id} in PostgreSQL`,
      () => options.targetPluginEngine.migrate(plugin.storage),
      outcome,
    );
  }
  await step(
    'importing into PostgreSQL',
    async () =>
      postgresBackend.transfer.importSnapshot(target, await withoutEmptyLeftovers(target, snapshot, logger), {
        plugins,
      }),
    outcome,
  );

  const warnings = await checkImportedData(target, logger);

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
    const renamed = await renameSqliteFile(options);
    renamedTo = renamed.renamedTo;
    if (renamed.warning) warnings.push(renamed.warning);
  }
  return { tables, totalRows, plugins: plugins.map((plugin) => plugin.id), renamedTo, warnings };
}
