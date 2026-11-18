// The plugin tables a backup carries and a restore replaces. The connection settings (which hold an encrypted
// credential bound to this host) and the backup feature's own tables are deliberately not part of it.
//
// A backup file names tables and columns by their physical names (`plugin_matter_nodes`, `lifecycle_state`), the same
// as the files 1.x wrote, so a backup made before the port still restores. Rows are read and written through the
// record port; the declared fields give the column names and the value types a restore checks.
import type { PluginStorageField, PluginStorageTable } from '@attraccess/plugins-backend-sdk';
import type { MatterTables } from '../plugin-storage/access';
import { MATTER_TABLES } from '../plugin-storage/tables';
import type { TableRows } from './format';

type Logical = Exclude<keyof typeof MATTER_TABLES, 'connection' | 'recoveryKeys' | 'backups'>;

/** The logical tables in a backup, in the order a restore writes them. */
export const BACKED_UP_TABLES = [
  'fabrics',
  'nodes',
  'endpoints',
  'endpointClusters',
  'endpointCapabilities',
  'endpointState',
  'commands',
  'reconciliationStatus',
] as const satisfies readonly Logical[];

type BackedUp = (typeof BACKED_UP_TABLES)[number];

const physicalName = (table: BackedUp): string => MATTER_TABLES[table].physicalName as string;

/** The physical names of the tables in a backup. */
export const PLUGIN_TABLES: readonly (readonly [string, BackedUp])[] = BACKED_UP_TABLES.map((table) => [
  physicalName(table),
  table,
]);

/**
 * The closed value sets and ranges the 1.x schema enforced with CHECK constraints. The neutral schema has none, so a
 * restore (the one place rows enter that the plugin did not build itself) checks them here.
 */
const ALLOWED_VALUES: Partial<Record<BackedUp, Record<string, readonly string[]>>> = {
  fabrics: { status: ['active', 'absent'] },
  nodes: {
    lifecycleState: ['unclaimed', 'claimed', 'detached', 'archived', 'removed'],
    detachedReason: ['absent_from_sidecar', 'fabric_mismatch', 'fabric_absent'],
    removalReason: ['force_removed', 'merged', 'replaced'],
    attestationStatus: ['verified', 'unverified', 'failed', 'unknown'],
  },
  endpoints: { removalReason: ['absent_from_sidecar', 'replaced', 'force_removed', 'merged'] },
  endpointClusters: { role: ['server', 'client'] },
  endpointState: {
    commandState: ['none', 'requested', 'accepted', 'reported', 'uncertain', 'failed'],
    quality: ['good', 'uncertain', 'fault', 'unavailable'],
    source: ['subscription_report', 'read', 'command_response'],
  },
  commands: { outcome: ['requested', 'accepted', 'reported', 'uncertain', 'failed'] },
  reconciliationStatus: { lastResult: ['applied', 'skipped_unavailable', 'skipped_non_authoritative', 'failed'] },
};

/** Whether `row` breaks a value set or range of the 1.x schema. */
function violatesChecks(logical: BackedUp, row: Record<string, unknown>): boolean {
  const sets = ALLOWED_VALUES[logical] ?? {};
  if (Object.entries(sets).some(([field, allowed]) => row[field] != null && !allowed.includes(row[field] as string))) {
    return true;
  }
  if (logical === 'endpoints') return (row['endpointId'] as number) < 0 || (row['endpointId'] as number) > 65_534;
  return logical === 'reconciliationStatus' && row['id'] !== 1;
}

const columnOf = (field: string, definition: PluginStorageField): string => definition.column ?? field;
const fieldsOf = (table: BackedUp): [string, PluginStorageField][] => Object.entries(MATTER_TABLES[table].fields);

/** Every row of every plugin table, as plain column/value objects keyed by the physical table name. */
export async function readTables(tables: MatterTables): Promise<TableRows> {
  const result: TableRows = {};
  for (const [name, logical] of PLUGIN_TABLES) {
    const fields = fieldsOf(logical);
    const rows = (await tables[logical].find()) as unknown as Record<string, unknown>[];
    result[name] = rows.map((row) =>
      Object.fromEntries(fields.map(([field, definition]) => [columnOf(field, definition), row[field] ?? null])),
    );
  }
  return result;
}

/** The columns of each plugin table: the only names a restore accepts. */
export function tableColumns(): Map<string, Set<string>> {
  return new Map(
    PLUGIN_TABLES.map(([name, logical]) => [
      name,
      new Set(fieldsOf(logical).map(([field, definition]) => columnOf(field, definition))),
    ]),
  );
}

/** A stored value as the declared field type wants it, or `undefined` when it cannot be that. */
function coerce(definition: PluginStorageField, value: unknown): unknown {
  if (value === null) return definition.nullable ? null : undefined;
  switch (definition.type) {
    case 'string':
    case 'text':
      return typeof value === 'string' ? value : undefined;
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
    case 'boolean':
      // 1.x files carry the engine's 0/1; the neutral value is a boolean.
      if (typeof value === 'boolean') return value;
      return value === 0 || value === 1 ? value === 1 : undefined;
    default:
      return undefined;
  }
}

/** One backup row as a record-port row, or null when a column is unknown or a value does not fit its field. */
function rowOf(logical: BackedUp, raw: Record<string, unknown>): Record<string, unknown> | null {
  const fields = fieldsOf(logical);
  const known = new Set(fields.map(([field, definition]) => columnOf(field, definition)));
  if (Object.keys(raw).some((name) => !known.has(name))) return null;
  const row: Record<string, unknown> = {};
  for (const [field, definition] of fields) {
    const value = raw[columnOf(field, definition)];
    if (value === undefined) {
      // A column the file does not carry: only a nullable one (or one with a default) may be missing.
      if (!definition.nullable && !definition.hasDefault) return null;
      if (definition.nullable) row[field] = null;
      continue;
    }
    const coerced = coerce(definition, value);
    if (coerced === undefined) return null;
    row[field] = coerced;
  }
  return violatesChecks(logical, row) ? null : row;
}

/** Whether tables from a backup may be written: known tables, known columns, scalar values only. */
export function tablesAreAcceptable(tables: TableRows): boolean {
  const columns = tableColumns();
  for (const [table, rows] of Object.entries(tables)) {
    const allowed = columns.get(table);
    if (!allowed) return false;
    for (const row of rows) {
      for (const [name, value] of Object.entries(row)) {
        if (!allowed.has(name)) return false;
        if (value !== null && !['string', 'number', 'boolean'].includes(typeof value)) return false;
      }
    }
  }
  return true;
}

/**
 * Replaces the content of every plugin table with the backup's, inside the caller's transaction. A row that does not
 * fit its table (a missing required column, a value of the wrong type) fails the whole replacement, like a row the
 * database refuses: the caller's transaction rolls back and nothing is replaced.
 */
export async function replaceTables(tables: MatterTables, rows: TableRows): Promise<void> {
  for (const [, logical] of PLUGIN_TABLES) {
    // Every row: the primary key is never null, so this filter matches all of them.
    const key = (MATTER_TABLES[logical] as PluginStorageTable).primaryKey[0];
    await (tables[logical] as unknown as DeleteAll).delete({ [key]: { isNull: false } });
  }
  for (const [name, logical] of PLUGIN_TABLES) {
    const decoded = (rows[name] ?? []).map((row) => rowOf(logical, row));
    if (decoded.some((row) => row === null)) throw new Error('unacceptable tables');
    if (decoded.length > 0)
      await (tables[logical] as unknown as InsertAll).insertMany(decoded as Record<string, unknown>[]);
  }
}

type DeleteAll = { delete(where: Record<string, unknown>): Promise<number> };
type InsertAll = { insertMany(rows: readonly Record<string, unknown>[]): Promise<unknown[]> };
