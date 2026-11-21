import type { DataSource, QueryRunner } from 'typeorm';
import {
  coreTables,
  describePostgresError,
  foreignKeys,
  isSecretColumn,
  orphanKeys,
  ownedSequences,
  primaryKey,
  quote,
  tableColumns,
  triggerTables,
} from './postgres-catalog';
import { sqliteColumns, sqliteRowPages, sqliteSequences, sqliteTables } from './sqlite-rows';
import { placeholder, SqliteImportError, toPostgresValue, type PostgresColumn, type SqliteCell } from './sqlite-values';

/** PostgreSQL accepts 65535 bind parameters per statement. */
const MAX_PARAMETERS = 60_000;
/** Rows per statement at most, so a table with large values (crash report core dumps) keeps messages small. */
const MAX_ROWS = 500;

interface TablePlan {
  readonly table: string;
  /** The SQLite columns that are copied, in SQLite order. */
  readonly sqliteColumns: string[];
  /** The PostgreSQL column each copied SQLite column goes to (same index). */
  readonly targets: PostgresColumn[];
  /** Indexes (into the copied columns) of the primary key, to name a row in an error. */
  readonly keyIndexes: number[];
}

export interface CopyResult {
  /** Rows copied per table. */
  readonly rows: ReadonlyMap<string, number>;
  /** SQLite tables PostgreSQL has no table for (plugin data, plugin bookkeeping): not copied. */
  readonly skipped: readonly string[];
}

/**
 * Matches the columns by name. A SQLite column without a PostgreSQL column would lose data and fails the import; a
 * generated PostgreSQL column is derived again; a PostgreSQL column SQLite lacks gets its default.
 */
async function planTable(pg: QueryRunner, sqlite: DataSource, table: string): Promise<TablePlan> {
  const { stored, generated } = await tableColumns(pg, table);
  const byName = new Map(stored.map((column) => [column.name, column]));
  const copied: string[] = [];
  const targets: PostgresColumn[] = [];
  for (const column of await sqliteColumns(sqlite, table)) {
    const target = byName.get(column);
    if (target) {
      copied.push(column);
      targets.push(target);
    } else if (!generated.has(column)) {
      throw new SqliteImportError(`Table ${table}: the SQLite column ${column} has no counterpart in PostgreSQL`);
    }
  }
  const keys = await primaryKey(pg, table);
  return { table, sqliteColumns: copied, targets, keyIndexes: keys.map((key) => copied.indexOf(key)) };
}

/** Names a row by its primary key, or by its position in rowid order when the key is missing or secret. */
export function rowName(
  plan: Pick<TablePlan, 'sqliteColumns' | 'keyIndexes'>,
  row: SqliteCell[],
  index: number,
): string {
  const key = plan.keyIndexes.filter((at) => at >= 0);
  const secret = key.some((at) => isSecretColumn(plan.sqliteColumns[at]));
  if (key.length === 0 || key.length !== plan.keyIndexes.length || secret) return `row ${index + 1}`;
  return `row ${key.map((at) => `${plan.sqliteColumns[at]}=${String(row[at].exact ?? row[at].value)}`).join(', ')}`;
}

function parameters(plan: TablePlan, row: SqliteCell[], index: number): unknown[] {
  return plan.targets.map((target, at) => {
    try {
      return toPostgresValue(target, row[at]);
    } catch (error) {
      throw new SqliteImportError(
        `Table ${plan.table}, ${rowName(plan, row, index)}, column ${target.name}: the value ${(error as Error).message}`,
      );
    }
  });
}

function insertSql(plan: TablePlan, rows: number): string {
  const width = plan.targets.length;
  const tuples: string[] = [];
  for (let row = 0; row < rows; row++) {
    tuples.push(`(${plan.targets.map((target, col) => placeholder(row * width + col + 1, target)).join(', ')})`);
  }
  return `INSERT INTO ${quote(plan.table)} (${plan.targets.map((t) => quote(t.name)).join(', ')}) VALUES ${tuples.join(', ')}`;
}

/**
 * Inserts one page of rows as one statement. A failing page is retried row by row to name the first offending row; a
 * page whose rows all go in one by one (a statement that was too large) is not an error.
 */
async function loadPage(pg: QueryRunner, plan: TablePlan, page: SqliteCell[][], first: number): Promise<void> {
  const values = page.flatMap((row, offset) => parameters(plan, row, first + offset));
  try {
    await pg.query('SAVEPOINT sqlite_import_chunk');
    await pg.query(insertSql(plan, page.length), values);
    await pg.query('RELEASE SAVEPOINT sqlite_import_chunk');
    return;
  } catch {
    await pg.query('ROLLBACK TO SAVEPOINT sqlite_import_chunk');
  }
  for (const [offset, row] of page.entries()) {
    try {
      await pg.query('SAVEPOINT sqlite_import_row');
      await pg.query(insertSql(plan, 1), parameters(plan, row, first + offset));
      await pg.query('RELEASE SAVEPOINT sqlite_import_row');
    } catch (rowError) {
      throw new SqliteImportError(
        `Table ${plan.table}, ${rowName(plan, row, first + offset)} cannot be stored: ${describePostgresError(rowError)}`,
        { cause: rowError },
      );
    }
  }
}

/** Copies a table page by page; returns the number of rows. */
async function copyTable(pg: QueryRunner, sqlite: DataSource, plan: TablePlan): Promise<number> {
  if (plan.targets.length === 0) return 0;
  const pageSize = Math.max(1, Math.min(MAX_ROWS, Math.floor(MAX_PARAMETERS / plan.targets.length)));
  let copied = 0;
  for await (const page of sqliteRowPages(sqlite, plan.table, plan.sqliteColumns, pageSize)) {
    await loadPage(pg, plan, page, copied);
    copied += page.length;
  }
  return copied;
}

/** Generated keys continue after the highest id SQLite ever issued: max(id) or sqlite_sequence, whichever is higher. */
async function continueSequences(
  pg: QueryRunner,
  copied: ReadonlySet<string>,
  issued: ReadonlyMap<string, number>,
): Promise<void> {
  for (const { table, column, sequence } of await ownedSequences(pg)) {
    if (!copied.has(table)) continue;
    const [{ top }]: { top: string }[] = await pg.query(
      `SELECT COALESCE(MAX(${quote(column)}), 0)::text AS top FROM ${quote(table)}`,
    );
    const last = Math.max(issued.get(table) ?? 0, Number(top));
    if (last > 0) await pg.query('SELECT setval($1::regclass, $2, true)', [quote(sequence), last]);
    else await pg.query('SELECT setval($1::regclass, 1, false)', [quote(sequence)]);
  }
}

/**
 * Replaces the core tables SQLite also has with the SQLite rows, inside the caller's transaction. Foreign keys are
 * dropped while rows are copied and re-added (and so verified) at the end; user triggers are disabled, so balances,
 * usage integrity and audit rows are taken from SQLite instead of being derived a second time.
 */
export async function copySqliteTables(pg: QueryRunner, sqlite: DataSource): Promise<CopyResult> {
  const core = new Set(await coreTables(pg));
  const tables = await sqliteTables(sqlite);
  const plans: TablePlan[] = [];
  for (const table of tables.filter((name) => core.has(name))) plans.push(await planTable(pg, sqlite, table));
  const skipped = tables.filter((name) => !core.has(name));

  const keys = await foreignKeys(pg);
  for (const key of keys) await pg.query(`ALTER TABLE ${quote(key.child)} DROP CONSTRAINT ${quote(key.name)}`);
  const triggered = await triggerTables(pg);
  for (const table of triggered) await pg.query(`ALTER TABLE ${quote(table)} DISABLE TRIGGER USER`);

  const copied = new Set(plans.map((plan) => plan.table));
  // The baseline's seed rows (roles, settings, templates) are replaced by the installation's own.
  if (copied.size > 0) await pg.query(`TRUNCATE ${[...copied].map(quote).join(', ')} RESTART IDENTITY`);
  const counts = new Map<string, number>();
  for (const plan of plans) counts.set(plan.table, await copyTable(pg, sqlite, plan));

  for (const key of keys) {
    try {
      await pg.query('SAVEPOINT sqlite_import_fk');
      await pg.query(`ALTER TABLE ${quote(key.child)} ADD CONSTRAINT ${quote(key.name)} ${key.definition}`);
      await pg.query('RELEASE SAVEPOINT sqlite_import_fk');
    } catch (error) {
      await pg.query('ROLLBACK TO SAVEPOINT sqlite_import_fk');
      throw new SqliteImportError(
        `Table ${key.child} breaks the foreign key ${key.name} (references ${key.parent}): a referenced row is ` +
          `missing; offending keys ${await orphanKeys(pg, key)}`,
        { cause: error },
      );
    }
  }
  await continueSequences(pg, copied, await sqliteSequences(sqlite));
  for (const table of triggered) await pg.query(`ALTER TABLE ${quote(table)} ENABLE TRIGGER USER`);
  return { rows: counts, skipped };
}
