import type { DatabaseSnapshot, SnapshotColumn, SnapshotValue, TableSnapshot } from '../transfer-snapshot';

/** Columns a PostgreSQL migration after the baseline added to a table, with the value every transferred row gets. */
interface AddedColumns {
  readonly table: string;
  readonly columns: readonly (SnapshotColumn & { readonly value: SnapshotValue })[];
}

/**
 * The frozen SQLite schema equals the PostgreSQL baseline. Every later PostgreSQL migration that changes the schema is
 * mirrored here, so a SQLite snapshot has the shape of the current schema: added columns get the value the migration
 * gave existing rows, and added tables are empty.
 */
const ADDED_COLUMNS: readonly AddedColumns[] = [
  // PostgresGlobalForms1795700000000 (ATT-796): every SQLite form is a resource form, none is deleted.
  {
    table: 'form',
    columns: [
      { name: 'scope', kind: 'text', value: 'resource' },
      { name: 'groupId', kind: 'integer', value: null },
      { name: 'deletedAt', kind: 'timestamp', value: null },
    ],
  },
];

const ADDED_TABLES: readonly TableSnapshot[] = [
  // PostgresGlobalForms1795700000000 (ATT-796): SQLite had no per-resource form overrides.
  {
    name: 'form_resource_override',
    columns: [
      { name: 'id', kind: 'integer' },
      { name: 'formId', kind: 'integer' },
      { name: 'resourceId', kind: 'integer' },
      { name: 'disabled', kind: 'boolean' },
      { name: 'isRequiredOnResourceUsageStart', kind: 'boolean' },
      { name: 'isRequiredOnResourceUsageTakeOver', kind: 'boolean' },
      { name: 'isRequiredOnResourceUsageEnd', kind: 'boolean' },
      { name: 'createdAt', kind: 'timestamp' },
      { name: 'updatedAt', kind: 'timestamp' },
    ],
    rows: [],
  },
];

function withColumns(table: TableSnapshot, added: AddedColumns): TableSnapshot {
  const missing = added.columns.filter((column) => !table.columns.some((existing) => existing.name === column.name));
  if (missing.length === 0) return table;
  return {
    ...table,
    columns: [...table.columns, ...missing.map(({ name, kind }) => ({ name, kind }))],
    rows: table.rows.map((row) => [...row, ...missing.map((column) => column.value)]),
  };
}

/** Brings a snapshot of the frozen SQLite schema to the current PostgreSQL schema. */
export function upgradeSqliteSnapshot(snapshot: DatabaseSnapshot): DatabaseSnapshot {
  const present = new Set(snapshot.tables.map((table) => table.name));
  return {
    ...snapshot,
    tables: [
      ...snapshot.tables.map((table) =>
        ADDED_COLUMNS.filter((added) => added.table === table.name).reduce(withColumns, table),
      ),
      ...ADDED_TABLES.filter((table) => !present.has(table.name)),
    ],
  };
}
