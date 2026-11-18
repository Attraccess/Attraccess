import type { ResolvedStep } from '../../../plugin-system/plugin-storage/storage-model';

/** Reads the schema of the database the migration runs on. */
export type SchemaQuery = (sql: string, params?: readonly unknown[]) => Promise<Record<string, unknown>[]>;

const REBUILD_LIMIT =
  'Removing it needs a rebuild of the table, which Attraccess does not do for plugin storage yet. Nothing was changed.';

/** Thrown before any statement of a step runs; the migration's transaction rolls back. */
export class PluginStorageStepUnsupported extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginStorageStepUnsupported';
  }
}

interface IndexRow {
  readonly name: string;
  readonly origin: string;
}

async function indexesOf(query: SchemaQuery, table: string): Promise<IndexRow[]> {
  const rows = await query(`SELECT "name", "origin" FROM pragma_index_list(?)`, [table]);
  return rows.map((row) => ({ name: String(row.name), origin: String(row.origin) }));
}

async function columnsOf(query: SchemaQuery, index: string): Promise<string[]> {
  const rows = await query(`SELECT "name" FROM pragma_index_info(?)`, [index]);
  return rows.map((row) => String(row.name).toLowerCase());
}

const sameColumns = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((column) => b.includes(column));

/**
 * An index the plugin drops must be one of its own table's. A 1.x table adopted in place may hold the "index" as a
 * UNIQUE constraint of its CREATE TABLE (an sqlite_autoindex), which DROP INDEX cannot remove.
 */
async function checkDropIndex(query: SchemaQuery, step: Extract<ResolvedStep, { op: 'dropIndex' }>): Promise<void> {
  const { table, index } = step;
  const [row] = await query(`SELECT "tbl_name" FROM sqlite_master WHERE type = 'index' AND name = ? COLLATE NOCASE`, [
    index.name,
  ]);
  if (row) {
    if (String(row.tbl_name).toLowerCase() !== table.physical.toLowerCase()) {
      throw new PluginStorageStepUnsupported(
        `The index "${index.name}" belongs to the table "${String(row.tbl_name)}", not to "${table.physical}"; ` +
          'a plugin may only drop indexes of its own tables. Nothing was changed.',
      );
    }
    return;
  }
  const columns = index.fields.map((name) => (table.fields.get(name)?.column ?? name).toLowerCase());
  for (const candidate of await indexesOf(query, table.physical)) {
    if (candidate.origin === 'u' && sameColumns(await columnsOf(query, candidate.name), columns)) {
      throw new PluginStorageStepUnsupported(
        `The index "${index.name}" of "${table.physical}" is a UNIQUE constraint of the 1.x table this plugin ` +
          `adopted. ${REBUILD_LIMIT}`,
      );
    }
  }
  throw new PluginStorageStepUnsupported(`The index "${index.name}" of "${table.physical}" does not exist.`);
}

/** The bodies of the CHECK constraints of a CREATE TABLE statement. */
export function checkConstraints(sql: string): string[] {
  const bodies: string[] = [];
  for (const match of sql.matchAll(/\bCHECK\s*\(/gi)) {
    let depth = 1;
    let end = (match.index as number) + match[0].length;
    while (end < sql.length && depth > 0) {
      if (sql[end] === '(') depth += 1;
      else if (sql[end] === ')') depth -= 1;
      end += 1;
    }
    bodies.push(sql.slice((match.index as number) + match[0].length, end - 1));
  }
  return bodies;
}

const mentions = (text: string, column: string): boolean =>
  new RegExp(`(^|[^A-Za-z0-9_])${column.replace(/[^A-Za-z0-9_]/g, '')}([^A-Za-z0-9_]|$)`, 'i').test(text);

/**
 * SQLite drops a column only when no index, UNIQUE or CHECK constraint uses it. Declared indexes are refused when the
 * declaration is compiled; this finds what a 1.x table adopted in place keeps beyond its declaration.
 */
async function checkDropColumn(query: SchemaQuery, step: Extract<ResolvedStep, { op: 'dropColumn' }>): Promise<void> {
  const { table, field } = step;
  const column = field.column.toLowerCase();
  for (const index of await indexesOf(query, table.physical)) {
    if ((await columnsOf(query, index.name)).includes(column)) {
      const kind = index.origin === 'u' ? 'UNIQUE constraint' : 'index';
      throw new PluginStorageStepUnsupported(
        `The column "${field.column}" of "${table.physical}" is part of the ${kind} "${index.name}" of the adopted ` +
          `1.x table, so it cannot be dropped. ${REBUILD_LIMIT}`,
      );
    }
  }
  const [row] = await query(`SELECT "sql" FROM sqlite_master WHERE type = 'table' AND name = ?`, [table.physical]);
  if (checkConstraints(String(row?.sql ?? '')).some((body) => mentions(body, field.column))) {
    throw new PluginStorageStepUnsupported(
      `The column "${field.column}" of "${table.physical}" is used by a CHECK constraint of the adopted 1.x table, ` +
        `so it cannot be dropped. ${REBUILD_LIMIT}`,
    );
  }
}

/** Refuses a step SQLite cannot apply to the objects as they are, before any of its statements runs. */
export async function checkSqliteStep(query: SchemaQuery, step: ResolvedStep): Promise<void> {
  if (step.op === 'dropIndex') await checkDropIndex(query, step);
  else if (step.op === 'dropColumn') await checkDropColumn(query, step);
}
