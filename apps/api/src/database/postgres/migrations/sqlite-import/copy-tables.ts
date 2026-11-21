import type { DataSource, QueryRunner } from 'typeorm';
import {
  coreTables,
  describePostgresError,
  foreignKeys,
  orphanKeys,
  ownedSequences,
  primaryKey,
  quote,
  tableColumns,
  triggerTables,
} from './postgres-catalog';
import { sqliteColumns, sqliteRows, sqliteSequences, sqliteTables } from './sqlite-rows';
import { placeholder, SqliteImportError, toPostgresValue, type PostgresColumn, type SqliteCell } from './sqlite-values';

/** PostgreSQL accepts 65535 bind parameters per statement. */
const MAX_PARAMETERS = 60_000;

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

function rowName(plan: TablePlan, row: SqliteCell[], index: number): string {
  const key = plan.keyIndexes.filter((at) => at >= 0);
  if (key.length === 0 || key.length !== plan.keyIndexes.length) return `row ${index + 1}`;
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

/** Inserts the rows in chunks. A failing chunk is retried row by row to name the first offending row. */
async function loadRows(pg: QueryRunner, plan: TablePlan, rows: SqliteCell[][]): Promise<void> {
  if (plan.targets.length === 0 || rows.length === 0) return;
  const perStatement = Math.max(1, Math.floor(MAX_PARAMETERS / plan.targets.length));
  for (let start = 0; start < rows.length; start += perStatement) {
    const chunk = rows.slice(start, start + perStatement);
    const values = chunk.flatMap((row, offset) => parameters(plan, row, start + offset));
    try {
      await pg.query('SAVEPOINT sqlite_import_chunk');
      await pg.query(insertSql(plan, chunk.length), values);
      await pg.query('RELEASE SAVEPOINT sqlite_import_chunk');
    } catch (chunkError) {
      if (chunkError instanceof SqliteImportError) throw chunkError;
      await pg.query('ROLLBACK TO SAVEPOINT sqlite_import_chunk');
      for (const [offset, row] of chunk.entries()) {
        try {
          await pg.query('SAVEPOINT sqlite_import_row');
          await pg.query(insertSql(plan, 1), parameters(plan, row, start + offset));
          await pg.query('RELEASE SAVEPOINT sqlite_import_row');
        } catch (rowError) {
          throw new SqliteImportError(
            `Table ${plan.table}, ${rowName(plan, row, start + offset)} cannot be stored: ${describePostgresError(rowError)}`,
            { cause: rowError },
          );
        }
      }
      throw new SqliteImportError(`Table ${plan.table} cannot be stored: ${describePostgresError(chunkError)}`, {
        cause: chunkError,
      });
    }
  }
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
  for (const plan of plans) {
    const rows = await sqliteRows(sqlite, plan.table, plan.sqliteColumns);
    await loadRows(pg, plan, rows);
    counts.set(plan.table, rows.length);
  }

  for (const key of keys) {
    try {
      await pg.query('SAVEPOINT sqlite_import_fk');
      await pg.query(`ALTER TABLE ${quote(key.child)} ADD CONSTRAINT ${quote(key.name)} ${key.definition}`);
      await pg.query('RELEASE SAVEPOINT sqlite_import_fk');
    } catch (error) {
      await pg.query('ROLLBACK TO SAVEPOINT sqlite_import_fk');
      throw new SqliteImportError(
        `Table ${key.child} breaks the foreign key ${key.name} (references ${key.parent}): ` +
          `${describePostgresError(error)}; offending keys ${await orphanKeys(pg, key)}`,
        { cause: error },
      );
    }
  }
  await continueSequences(pg, copied, await sqliteSequences(sqlite));
  for (const table of triggered) await pg.query(`ALTER TABLE ${quote(table)} ENABLE TRIGGER USER`);
  return { rows: counts, skipped };
}
