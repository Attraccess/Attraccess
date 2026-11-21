import type { Logger as TypeOrmLogger, QueryRunner } from 'typeorm';
import { UPGRADE_DOCS_URL } from '../../../backend/database-type';
import { migrateFrozenSqlite, openFrozenSqlite } from '../../../sqlite/sqlite-frozen-track';
import { createSqliteSource } from '../../../sqlite/sqlite-source';
import { copySqliteTables, type CopyResult } from './copy-tables';
import { holdsUsers, predatesImport } from './postgres-catalog';
import { fileExists, moveToBackup, PartialBackupMoveError, sqliteBackupDirectory } from './sqlite-backup';
import { SqliteImportError } from './sqlite-values';

export interface ImportLog {
  log(message: string): void;
  warn(message: string): void;
  debug(message: string): void;
}

export interface ImportSqliteOptions {
  /** `<STORAGE_ROOT>/attraccess.sqlite`. */
  readonly sqliteFile: string;
  readonly logger: ImportLog;
  readonly now?: () => Date;
}

function refuseNonBlankTarget(sqliteFile: string): SqliteImportError {
  return new SqliteImportError(
    `${sqliteFile} exists, but the PostgreSQL database already holds Attraccess data (users). The SQLite data is ` +
      `imported only into an empty database and never merged. If an earlier start already imported this file but ` +
      `stopped before moving it, PostgreSQL holds your data: move ${sqliteFile} to ` +
      `${sqliteBackupDirectory(sqliteFile)}. Otherwise either empty the PostgreSQL database (drop and recreate the ` +
      `database or its schema) and start again to import the SQLite file, or move ${sqliteFile} out of the storage ` +
      `folder if PostgreSQL already holds your data. See ${UPGRADE_DOCS_URL}.`,
  );
}

/** Puts a failure before the commit in context: nothing was imported, the file stays, a restart retries. */
function importFailed(sqliteFile: string, error: unknown): SqliteImportError {
  return new SqliteImportError(
    `The import of ${sqliteFile} into PostgreSQL failed; nothing was imported and the file stays where it is. ` +
      `${(error as Error).message}. Fix the cause (for example correct or delete the named row in the SQLite file, ` +
      `on a copy first) and start again. See ${UPGRADE_DOCS_URL}.`,
    { cause: error },
  );
}

/** Step 1: the released SQLite migrations, applied to the file itself. Closing the file checkpoints its WAL. */
async function migrateSqliteFile(sqliteFile: string): Promise<string[]> {
  const source = await openFrozenSqlite(sqliteFile);
  try {
    return await migrateFrozenSqlite(source);
  } finally {
    await source.destroy();
  }
}

/**
 * Runs `work` with the connection's query log stripped of parameters. The TypeORM CLI (`api:migrations-run`) logs every
 * query with its parameters, and the imported rows hold password hashes, tokens and secrets.
 */
async function withoutLoggedParameters<T>(pg: QueryRunner, work: () => Promise<T>): Promise<T> {
  const connection = pg.connection as { logger: TypeOrmLogger };
  const original = connection.logger;
  connection.logger = Object.assign(Object.create(original) as TypeOrmLogger, {
    logQuery: (query: string, _parameters?: unknown[], runner?: QueryRunner) =>
      original.logQuery(query, undefined, runner),
    logQueryError: (error: string | Error, query: string, _parameters?: unknown[], runner?: QueryRunner) =>
      original.logQueryError(error, query, undefined, runner),
    logQuerySlow: (time: number, query: string, _parameters?: unknown[], runner?: QueryRunner) =>
      original.logQuerySlow(time, query, undefined, runner),
  });
  try {
    return await work();
  } finally {
    connection.logger = original;
  }
}

/**
 * Copies the core data in one transaction the import owns; nothing is imported unless it commits. A failure before the
 * commit is reported as such; closing the SQLite file afterwards cannot turn a committed import into a failure.
 */
async function copyInTransaction(pg: QueryRunner, sqliteFile: string): Promise<CopyResult> {
  const sqlite = createSqliteSource(sqliteFile);
  try {
    await sqlite.initialize();
    await pg.startTransaction();
    try {
      // Another session could only hold these fresh tables briefly; the import waits instead of failing.
      await pg.query('SET LOCAL lock_timeout = 0');
      // Reading a large SQLite table leaves the transaction idle for a while; the connection default would end it.
      await pg.query('SET LOCAL idle_in_transaction_session_timeout = 0');
      const result = await copySqliteTables(pg, sqlite);
      await pg.commitTransaction();
      return result;
    } catch (error) {
      await pg.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    throw importFailed(sqliteFile, error);
  } finally {
    if (sqlite.isInitialized) await sqlite.destroy().catch(() => undefined);
  }
}

function logSummary(logger: ImportLog, result: CopyResult, location: string): void {
  const counts = [...result.rows].filter(([, rows]) => rows > 0);
  logger.log(
    `SQLite import complete: ${total(result)} rows in ${counts.length} tables; the SQLite file is at ${location}.`,
  );
  for (const [table, rows] of counts) logger.log(`  ${table}: ${rows}`);
  if (result.skipped.length > 0) {
    logger.warn(
      `Not imported (plugin data and other tables PostgreSQL has no table for): ${result.skipped.join(', ')}. ` +
        `Plugins start empty on PostgreSQL; their old data stays in ${location}.`,
    );
  }
}

const total = (result: CopyResult): number => [...result.rows.values()].reduce((sum, rows) => sum + rows, 0);

/** After the commit, a file that cannot be moved is a warning: the data is in PostgreSQL. Returns where the file is. */
async function moveAfterImport(sqliteFile: string, logger: ImportLog, now?: Date): Promise<string> {
  try {
    return await moveToBackup(sqliteFile, now);
  } catch (error) {
    if (error instanceof PartialBackupMoveError) {
      logger.warn(
        `The SQLite data is in PostgreSQL and the SQLite file is now ${error.location}, but ${error.message}. ` +
          `Move the files left behind next to ${error.location} or delete them.`,
      );
      return error.location;
    }
    logger.warn(
      `The SQLite data is in PostgreSQL, but moving ${sqliteFile} to ${sqliteBackupDirectory(sqliteFile)} failed: ` +
        `${(error as Error).message}. Move or delete the SQLite file (and its -wal, -shm and -journal files) yourself.`,
    );
    return sqliteFile;
  }
}

/**
 * Moves the data of a SQLite installation (`<STORAGE_ROOT>/attraccess.sqlite`) into a blank PostgreSQL database at
 * the baseline: brings the file to the last SQLite migration, copies every core table in one transaction, then moves
 * the file to `<STORAGE_ROOT>/sqlite-backup/`. No file: nothing happens. A failure before the commit imports nothing
 * and leaves the file in place, so the next start retries. After the commit the import counts as done: a file that
 * cannot be moved is a warning.
 */
export async function importSqliteInstallation(pg: QueryRunner, options: ImportSqliteOptions): Promise<void> {
  const { sqliteFile, logger } = options;
  if (!(await fileExists(sqliteFile))) {
    logger.log(`No SQLite file at ${sqliteFile}: nothing to import.`);
    return;
  }
  // A database set up by an earlier 2.0 release (later migrations already recorded) handled its SQLite file then.
  if (await predatesImport(pg)) {
    logger.warn(
      `${sqliteFile} is not imported: this PostgreSQL database was set up by an earlier Attraccess 2.0 release. ` +
        `Move the file to ${sqliteBackupDirectory(sqliteFile)} or delete it once you are sure PostgreSQL holds your data ` +
        `(to import it instead, empty the PostgreSQL database and start again).`,
    );
    return;
  }
  // Checked before the file is touched: a refused import changes nothing.
  if (await holdsUsers(pg)) throw refuseNonBlankTarget(sqliteFile);

  logger.log(`Importing the SQLite database ${sqliteFile} into PostgreSQL...`);
  let applied: string[];
  try {
    applied = await migrateSqliteFile(sqliteFile);
  } catch (error) {
    throw importFailed(sqliteFile, error);
  }
  logger.log(`Brought the SQLite file to the last SQLite migration (${applied.length} migration(s) applied).`);
  const result = await withoutLoggedParameters(pg, () => copyInTransaction(pg, sqliteFile));
  logger.log(`Copied ${total(result)} rows into PostgreSQL (committed).`);
  logSummary(logger, result, await moveAfterImport(sqliteFile, logger, options.now?.()));
}
