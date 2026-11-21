import type { QueryRunner } from 'typeorm';
import { migrateFrozenSqlite, openFrozenSqlite } from '../../../sqlite/sqlite-frozen-track';
import { createSqliteSource } from '../../../sqlite/sqlite-source';
import { copySqliteTables, type CopyResult } from './copy-tables';
import { holdsUsers } from './postgres-catalog';
import { fileExists, moveToBackup, sqliteBackupDirectory } from './sqlite-backup';
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
      `imported only into an empty database and never merged. Either empty the PostgreSQL database (drop and create ` +
      `it) and start again to import the SQLite file, or move ${sqliteFile} out of the storage folder if PostgreSQL ` +
      `already holds your data.`,
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

/** Copies the core data in one transaction the import owns; nothing is imported unless it commits. */
async function copyInTransaction(pg: QueryRunner, sqliteFile: string): Promise<CopyResult> {
  const sqlite = createSqliteSource(sqliteFile);
  await sqlite.initialize();
  try {
    await pg.startTransaction();
    try {
      // Another session could only hold these fresh tables briefly; the import waits instead of failing.
      await pg.query('SET LOCAL lock_timeout = 0');
      const result = await copySqliteTables(pg, sqlite);
      await pg.commitTransaction();
      return result;
    } catch (error) {
      await pg.rollbackTransaction().catch(() => undefined);
      throw error;
    }
  } finally {
    await sqlite.destroy();
  }
}

function logSummary(logger: ImportLog, result: CopyResult, location: string): void {
  const counts = [...result.rows].filter(([, rows]) => rows > 0);
  const total = counts.reduce((sum, [, rows]) => sum + rows, 0);
  logger.log(`SQLite import complete: ${total} rows in ${counts.length} tables; the SQLite file is now ${location}.`);
  for (const [table, rows] of counts) logger.log(`  ${table}: ${rows}`);
  if (result.skipped.length > 0) {
    logger.warn(
      `Not imported (plugin data and other tables PostgreSQL has no table for): ${result.skipped.join(', ')}. ` +
        `Plugins start empty on PostgreSQL; their old data stays only in ${location}.`,
    );
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
    logger.debug(`No SQLite file at ${sqliteFile}: nothing to import.`);
    return;
  }
  // Checked before the file is touched: a refused import changes nothing.
  if (await holdsUsers(pg)) throw refuseNonBlankTarget(sqliteFile);

  logger.log(`Importing the SQLite database ${sqliteFile} into PostgreSQL...`);
  const applied = await migrateSqliteFile(sqliteFile);
  logger.log(`Brought the SQLite file to the last SQLite migration (${applied.length} migration(s) applied).`);
  const result = await copyInTransaction(pg, sqliteFile);

  let location = sqliteFile;
  try {
    location = await moveToBackup(sqliteFile, options.now?.());
  } catch (error) {
    logger.warn(
      `The SQLite data is in PostgreSQL, but moving ${sqliteFile} to ${sqliteBackupDirectory(sqliteFile)} failed: ` +
        `${(error as Error).message}. Move or delete the SQLite file (and its -wal, -shm and -journal files) yourself.`,
    );
  }
  logSummary(logger, result, location);
}
