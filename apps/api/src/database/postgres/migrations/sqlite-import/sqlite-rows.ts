import type { DataSource } from 'typeorm';
import { quote } from './postgres-catalog';
import type { SqliteCell } from './sqlite-values';

/** The migration bookkeeping of the SQLite track: it has no meaning in PostgreSQL. */
const SQLITE_BOOKKEEPING = new Set(['migrations', 'typeorm_metadata']);

/** The data tables of the SQLite file (no SQLite internals, no migration bookkeeping). */
export async function sqliteTables(source: DataSource): Promise<string[]> {
  const rows: { name: string }[] = await source.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  return rows.map((row) => row.name).filter((name) => !SQLITE_BOOKKEEPING.has(name));
}

/** Stored columns of a SQLite table; generated columns (hidden 2 or 3) are derived and never copied. */
export async function sqliteColumns(source: DataSource, table: string): Promise<string[]> {
  const columns: { name: string; hidden: number }[] = await source.query(`PRAGMA table_xinfo(${quote(table)})`);
  return columns.filter((column) => column.hidden === 0).map((column) => column.name);
}

/**
 * The rows of a table in rowid order, a page at a time (a large table never sits in memory whole), each cell with its
 * storage class and SQLite's exact text of a number.
 */
export async function* sqliteRowPages(
  source: DataSource,
  table: string,
  columns: readonly string[],
  pageSize: number,
): AsyncGenerator<SqliteCell[][]> {
  if (columns.length === 0) return;
  const selects = columns.flatMap((column, index) => {
    const name = quote(column);
    return [
      `${name} AS v${index}`,
      `typeof(${name}) AS t${index}`,
      `CASE WHEN typeof(${name}) IN ('integer', 'real') THEN CAST(${name} AS TEXT) END AS x${index}`,
    ];
  });
  // The rowid is carried as text: an INTEGER PRIMARY KEY can hold ids beyond JavaScript's safe integers.
  const select = `SELECT CAST(rowid AS TEXT) AS r, ${selects.join(', ')} FROM ${quote(table)}`;
  let after: string | null = null;
  for (;;) {
    const rows: Record<string, unknown>[] =
      after === null
        ? await source.query(`${select} ORDER BY rowid LIMIT ?`, [pageSize])
        : await source.query(`${select} WHERE rowid > CAST(? AS INTEGER) ORDER BY rowid LIMIT ?`, [after, pageSize]);
    if (rows.length === 0) return;
    after = String(rows[rows.length - 1].r);
    yield rows.map((row) =>
      columns.map((_, index) => ({
        value: row[`v${index}`],
        storage: row[`t${index}`] as SqliteCell['storage'],
        exact: (row[`x${index}`] as string | null) ?? null,
      })),
    );
    if (rows.length < pageSize) return;
  }
}

/** The highest id SQLite ever issued per AUTOINCREMENT table, also after deletes. Empty without such tables. */
export async function sqliteSequences(source: DataSource): Promise<Map<string, number>> {
  const present = await source.query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'");
  if (present.length === 0) return new Map();
  const rows: { name: string; seq: number }[] = await source.query('SELECT name, seq FROM sqlite_sequence');
  return new Map(rows.map((row) => [row.name, Number(row.seq)]));
}
