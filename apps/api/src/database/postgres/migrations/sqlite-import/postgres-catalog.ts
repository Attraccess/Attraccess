import type { DataSource, QueryRunner } from 'typeorm';
import type { PostgresColumn } from './sqlite-values';

type Query = Pick<QueryRunner, 'query'> | Pick<DataSource, 'query'>;

export const quote = (identifier: string): string => `"${identifier.replace(/"/g, '""')}"`;

/** The migration bookkeeping of the PostgreSQL track: never emptied or filled by the import. */
const BOOKKEEPING = new Set(['migrations', 'typeorm_metadata']);

/** Every base table of the current schema except the migration bookkeeping. */
export async function coreTables(manager: Query): Promise<string[]> {
  const rows: { table_name: string }[] = await manager.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  return rows.map((row) => row.table_name).filter((name) => !BOOKKEEPING.has(name));
}

export interface TableColumns {
  /** Stored columns in table order, with their data types. */
  readonly stored: PostgresColumn[];
  /** Generated columns: derived by PostgreSQL, never written. */
  readonly generated: ReadonlySet<string>;
}

export async function tableColumns(manager: Query, table: string): Promise<TableColumns> {
  const rows: { column_name: string; data_type: string; is_generated: string }[] = await manager.query(
    `SELECT column_name, data_type, is_generated FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return {
    stored: rows
      .filter((row) => row.is_generated === 'NEVER')
      .map((row) => ({ name: row.column_name, dataType: row.data_type })),
    generated: new Set(rows.filter((row) => row.is_generated !== 'NEVER').map((row) => row.column_name)),
  };
}

export async function primaryKey(manager: Query, table: string): Promise<string[]> {
  const rows: { attname: string }[] = await manager.query(
    `SELECT a.attname FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indisprimary AND i.indrelid = to_regclass(quote_ident(current_schema()) || '.' || quote_ident($1))
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [table],
  );
  return rows.map((row) => row.attname);
}

export interface ForeignKey {
  readonly name: string;
  readonly child: string;
  readonly parent: string;
  readonly childColumns: string[];
  readonly parentColumns: string[];
  readonly definition: string;
}

export async function foreignKeys(manager: Query): Promise<ForeignKey[]> {
  const rows: {
    name: string;
    child: string;
    parent: string;
    child_columns: string[];
    parent_columns: string[];
    definition: string;
  }[] = await manager.query(
    `SELECT c.conname AS name, cl.relname AS child, pl.relname AS parent,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS child_columns,
        (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(c.confkey) WITH ORDINALITY k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.attnum) AS parent_columns,
        pg_get_constraintdef(c.oid) AS definition
       FROM pg_constraint c
       JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pl ON pl.oid = c.confrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE c.contype = 'f' AND n.nspname = current_schema() ORDER BY cl.relname, c.conname`,
  );
  return rows.map((row) => ({
    name: row.name,
    child: row.child,
    parent: row.parent,
    childColumns: row.child_columns,
    parentColumns: row.parent_columns,
    definition: row.definition,
  }));
}

/**
 * Key columns whose values are credential material (e.g. `mcp_oauth_token.tokenHash`, `sso_logout_state.key`): never
 * printed in an error.
 */
export function isSecretColumn(column: string): boolean {
  return /hash|token|secret|^key$/i.test(column);
}

/**
 * The first child rows that break a foreign key, named by their primary key and the foreign key columns: only key
 * columns, never other columns of the row, and never a key that is credential material.
 */
export async function orphanKeys(manager: Query, key: ForeignKey): Promise<string> {
  const join = key.childColumns.map((c, i) => `p.${quote(key.parentColumns[i])} = c.${quote(c)}`).join(' AND ');
  const notNull = key.childColumns.map((c) => `c.${quote(c)} IS NOT NULL`).join(' AND ');
  const rowKey = (await primaryKey(manager, key.child)).filter((c) => !key.childColumns.includes(c));
  const shown = [...rowKey, ...key.childColumns].filter((c) => !isSecretColumn(c));
  if (shown.length === 0) return '(not shown: the key columns hold credentials)';
  const select = shown.map((c) => `c.${quote(c)}::text AS ${quote(c)}`).join(', ');
  const rows = await manager.query(
    `SELECT ${select} FROM ${quote(key.child)} c WHERE ${notNull}
       AND NOT EXISTS (SELECT 1 FROM ${quote(key.parent)} p WHERE ${join}) LIMIT 5`,
  );
  return JSON.stringify(rows);
}

/** Tables with user triggers (balances, usage integrity, audit immutability). */
export async function triggerTables(manager: Query): Promise<string[]> {
  const rows: { relname: string }[] = await manager.query(
    `SELECT DISTINCT cl.relname FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname = current_schema() ORDER BY cl.relname`,
  );
  return rows.map((row) => row.relname);
}

/** Sequences owned by table columns (serial and identity): table, column, sequence. */
export async function ownedSequences(manager: Query): Promise<{ table: string; column: string; sequence: string }[]> {
  return manager.query(
    `SELECT t.relname AS "table", a.attname AS "column", s.relname AS sequence
       FROM pg_class s
       JOIN pg_namespace n ON n.oid = s.relnamespace
       JOIN pg_depend d ON d.objid = s.oid AND d.deptype IN ('a', 'i') AND d.classid = 'pg_class'::regclass
       JOIN pg_class t ON t.oid = d.refobjid
       JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      WHERE s.relkind = 'S' AND n.nspname = current_schema() ORDER BY t.relname`,
  );
}

/** Whether PostgreSQL already holds Attraccess data: any user. The baseline seeds none. */
export async function holdsUsers(manager: Query): Promise<boolean> {
  const table = await manager.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'user'`,
  );
  if (table.length === 0) return false;
  return (await manager.query('SELECT 1 FROM "user" LIMIT 1')).length > 0;
}

/** What the common SQLSTATE codes of a refused row mean. */
const SQLSTATE_MEANING: Readonly<Record<string, string>> = {
  '23502': 'a required value is missing',
  '23505': 'a duplicate of a unique value',
  '23514': 'a check constraint is broken',
  '23503': 'a foreign key is broken',
  '23000': 'an integrity rule is broken',
  '22P02': 'the text is not valid for the column type',
  '22001': 'the value is too long',
};

/**
 * A failure as it may be logged: the SQLSTATE, the constraint and the column. Never the driver's message or detail
 * (they can quote row values such as password hashes or tokens).
 */
export function describePostgresError(error: unknown): string {
  const failure =
    (error as { driverError?: Record<string, unknown> })?.driverError ?? (error as Record<string, unknown>);
  const code = String(failure?.code ?? 'unknown');
  const parts = [SQLSTATE_MEANING[code] ? `${SQLSTATE_MEANING[code]} (SQLSTATE ${code})` : `SQLSTATE ${code}`];
  if (failure?.constraint) parts.push(`constraint ${String(failure.constraint)}`);
  if (failure?.column) parts.push(`column ${String(failure.column)}`);
  return parts.join(', ');
}
