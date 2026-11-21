import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource } from 'typeorm';
import {
  coreTables,
  ownedSequences,
  quote,
  tableColumns,
} from '../../../database/postgres/migrations/sqlite-import/postgres-catalog';
import {
  sqliteColumns,
  sqliteSequences,
  sqliteTables,
} from '../../../database/postgres/migrations/sqlite-import/sqlite-rows';
import type { SqliteCell } from '../../../database/postgres/migrations/sqlite-import/sqlite-values';
import { createSqliteSource } from '../../../database/sqlite/sqlite-source';
import { migrateSqliteTo } from '../../../database/sqlite/sqlite-import.test-fixture';
import type { OlderState } from './older-state.test-fixture';

/** The storage root of a stopped SQLite installation: `<root>/attraccess.sqlite`, nothing else. */
export interface OldInstallation {
  readonly storageRoot: string;
  readonly file: string;
  /** Where the import moves the file. */
  readonly backup: string;
  remove(): Promise<void>;
}

/**
 * The SQLite file of an older release in a storage root of its own: migrated only up to the state's timestamp,
 * seeded with the data of that release, then closed like a stopped installation.
 */
export async function createOldInstallation(state: OlderState): Promise<OldInstallation> {
  process.env.AUTH_SESSION_SECRET ||= 'e2e-sqlite-import-secret';
  const storageRoot = await mkdtemp(join(tmpdir(), 'attraccess-sqlite-installation-'));
  const file = join(storageRoot, 'attraccess.sqlite');
  const source = await migrateSqliteTo(file, state.timestamp);
  try {
    await state.seed(source);
  } finally {
    await source.destroy();
  }
  return {
    storageRoot,
    file,
    backup: join(storageRoot, 'sqlite-backup', 'attraccess.sqlite'),
    remove: () => rm(storageRoot, { recursive: true, force: true }),
  };
}

/** Runs `work` with STORAGE_ROOT pointing at `storageRoot` (the import resolves the SQLite file from it). */
export async function withStorageRoot<T>(storageRoot: string, work: () => Promise<T>): Promise<T> {
  const saved = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = storageRoot;
  try {
    return await work();
  } finally {
    process.env.STORAGE_ROOT = saved;
  }
}

export const sha256 = async (file: string): Promise<string> =>
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex');

/** JSON text with sorted object keys: jsonb reorders keys, equal documents must compare equal. */
function canonical(value: unknown): string {
  const sorted = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(sorted)
      : input && typeof input === 'object'
        ? Object.fromEntries(
            Object.entries(input)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : input;
  return JSON.stringify(sorted(value));
}

const isInstant = (dataType: string) => dataType.startsWith('timestamp');

/** How PostgreSQL hands a value back for comparison: instants as UTC ISO with milliseconds, everything else as text. */
function postgresExpression(column: string, dataType: string): string {
  const name = quote(column);
  if (isInstant(dataType)) return `to_char(${name} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  if (dataType === 'bytea') return `encode(${name}, 'hex')`;
  return `${name}::text`;
}

/** The same value read from the SQLite cell, independently of the import's own conversion. */
function sqliteValue(cell: SqliteCell, dataType: string): unknown {
  if (cell.storage === 'null') return null;
  if (cell.storage === 'blob') return Buffer.from(cell.value as Uint8Array).toString('hex');
  const text = cell.exact ?? String(cell.value);
  if (dataType === 'boolean') return text === '1' ? 'true' : 'false';
  if (isInstant(dataType)) {
    const zoned = /(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text}Z`;
    return new Date(zoned.replace(' ', 'T')).toISOString();
  }
  if (dataType === 'json' || dataType === 'jsonb') return JSON.parse(text);
  if (dataType === 'double precision' || dataType === 'real') return Number(text);
  if (dataType === 'bytea') return Buffer.from(text).toString('hex');
  return text;
}

function postgresValue(value: unknown, dataType: string): unknown {
  if (value === null) return null;
  if (dataType === 'json' || dataType === 'jsonb') return JSON.parse(String(value));
  if (dataType === 'double precision' || dataType === 'real') return Number(value);
  return value;
}

/** The rows of a SQLite table, read here and not by the import: numbers as SQLite's own text, never via a double. */
async function readSqliteRows(sqlite: DataSource, table: string, columns: readonly string[]): Promise<SqliteCell[][]> {
  if (columns.length === 0) return [];
  const selects = columns.map(
    (column, at) =>
      `typeof(${quote(column)}) AS t${at}, CASE WHEN typeof(${quote(column)}) IN ('integer', 'real') ` +
      `THEN CAST(${quote(column)} AS TEXT) ELSE ${quote(column)} END AS v${at}`,
  );
  const rows: Record<string, unknown>[] = await sqlite.query(`SELECT ${selects.join(', ')} FROM ${quote(table)}`);
  return rows.map((row) =>
    columns.map((_, at) => {
      const storage = row[`t${at}`] as SqliteCell['storage'];
      const value = row[`v${at}`];
      return { value, storage, exact: storage === 'integer' || storage === 'real' ? String(value) : null };
    }),
  );
}

/**
 * Compares every core table that the SQLite file has with PostgreSQL, column by column (the columns SQLite has), row
 * by row (in a canonical order). Returns the differences; empty means equal.
 */
export async function compareWithSqlite(pg: DataSource, sqliteFile: string): Promise<string[]> {
  const sqlite = createSqliteSource(sqliteFile);
  await sqlite.initialize();
  const differences: string[] = [];
  try {
    const core = new Set(await coreTables(pg));
    for (const table of (await sqliteTables(sqlite)).filter((name) => core.has(name))) {
      const { stored } = await tableColumns(pg, table);
      const types = new Map(stored.map((column) => [column.name, column.dataType]));
      const columns = (await sqliteColumns(sqlite, table)).filter((column) => types.has(column));
      const expected = (await readSqliteRows(sqlite, table, columns))
        .map((row) => canonical(row.map((cell, at) => sqliteValue(cell, types.get(columns[at]) as string))))
        .sort();
      const selects = columns.map(
        (column, at) => `${postgresExpression(column, types.get(column) as string)} AS c${at}`,
      );
      const rows: Record<string, unknown>[] = await pg.query(`SELECT ${selects.join(', ')} FROM ${quote(table)}`);
      const actual = rows
        .map((row) => canonical(columns.map((column, at) => postgresValue(row[`c${at}`], types.get(column) as string))))
        .sort();
      if (actual.length !== expected.length) {
        differences.push(`${table}: ${expected.length} rows in SQLite, ${actual.length} in PostgreSQL`);
        continue;
      }
      expected.forEach((row, at) => {
        if (row !== actual[at]) differences.push(`${table}: ${row} in SQLite, ${actual[at]} in PostgreSQL`);
      });
    }
  } finally {
    await sqlite.destroy();
  }
  return differences;
}

/** Core tables whose sequence would issue an id at or below one SQLite already issued (the bookkeeping aside). */
export async function sequencesBehindSqlite(pg: DataSource, sqliteFile: string): Promise<string[]> {
  const sqlite = createSqliteSource(sqliteFile);
  await sqlite.initialize();
  try {
    const issued = await sqliteSequences(sqlite);
    const behind: string[] = [];
    const core = new Set(await coreTables(pg));
    for (const { table, column, sequence } of await ownedSequences(pg)) {
      // The migration bookkeeping of each engine is its own.
      if (!core.has(table)) continue;
      const [{ top }] = await pg.query(`SELECT COALESCE(MAX(${quote(column)}), 0)::int AS top FROM ${quote(table)}`);
      const [{ last }] = await pg.query(
        `SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END::int AS last FROM ${quote(sequence)}`,
      );
      if (last < Math.max(top, issued.get(table) ?? 0)) behind.push(table);
    }
    return behind;
  } finally {
    await sqlite.destroy();
  }
}
