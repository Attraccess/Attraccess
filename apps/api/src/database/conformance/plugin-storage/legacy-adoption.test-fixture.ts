import type {
  CompiledField,
  CompiledPluginStorage,
  CompiledSchema,
  CompiledTable,
} from '../../../plugin-system/plugin-storage/storage-model';
import { legacyMigrationsTableName } from '../../../plugin-system/plugin-storage/storage-model';
import type { BundledPluginStorage } from './bundled-plugins.test-fixture';
import type { StorageDatabase } from './storage-fixture';

// SQLite only: 1.x plugins existed only on SQLite, so their legacy layout is SQLite DDL.

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const literal = (value: unknown) =>
  typeof value === 'number' ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
const UUIDS = { seed: '00000000-0000-4000-8000-000000000001', write: '00000000-0000-4000-8000-000000000002' };

type Row = Record<string, unknown>;

/** A value of every field kind in the form the legacy 1.x code stored it, and what the record port reads back. */
function seedValue(field: CompiledField): { stored: unknown; read: unknown } {
  const text = `v-${field.column}`.slice(0, field.length ?? 255);
  switch (field.type) {
    case 'integer':
      return { stored: 7, read: 7 };
    case 'decimal':
      return {
        stored: 10 ** (field.scale ?? 0),
        read: (field.scale ?? 0) > 0 ? `1.${'0'.repeat(field.scale ?? 0)}` : '1',
      };
    case 'boolean':
      return { stored: 1, read: true };
    case 'timestamp':
      return { stored: '2026-03-02 09:00:00.123', read: new Date('2026-03-02T09:00:00.123Z') };
    case 'date':
      return { stored: '2026-03-02', read: '2026-03-02' };
    case 'json':
      return { stored: '{"a":[1,2]}', read: { a: [1, 2] } };
    case 'uuid':
      return { stored: UUIDS.seed, read: UUIDS.seed };
    default:
      return { stored: text, read: text };
  }
}

/** A second, different value of the field for a write through the record port. */
function writeValue(field: CompiledField): unknown {
  const values: Partial<Record<CompiledField['type'], unknown>> = {
    integer: 8,
    decimal: '2',
    boolean: false,
    timestamp: new Date('2026-04-05T06:07:08.009Z'),
    date: '2026-04-05',
    json: { b: true },
    uuid: UUIDS.write,
  };
  return field.type in values ? values[field.type] : `w-${field.column}`.slice(0, field.length ?? 255);
}

/** A referenced key of a parent row decides the foreign-key fields of a child row. */
function referencing(table: CompiledTable, rows: ReadonlyMap<string, Row>, own: Row): Row {
  const row = { ...own };
  for (const fk of table.foreignKeys) {
    const parent = rows.get(fk.references);
    if (parent) fk.fields.forEach((field, index) => (row[field] = parent[fk.referencedFields[index]]));
  }
  return row;
}

export interface SeededRows {
  /** Logical table name -> the row as the record port must read it back. */
  readonly expected: ReadonlyMap<string, Row>;
}

/**
 * Writes one row into every table of the schema (parents first) in the stored forms of the 1.x code, CHECK constraints
 * of the 1.x layout switched off on the seeding connection only (generic values do not satisfy Matter's enum checks;
 * the rows are read, not judged).
 */
export async function seedLegacyRows(db: StorageDatabase, storage: CompiledPluginStorage): Promise<SeededRows> {
  const expected = new Map<string, Row>();
  const storedRows = new Map<string, Row>();
  await db.execute('PRAGMA ignore_check_constraints = ON');
  try {
    for (const table of tablesInOrder(storage, storage.migrations[0].schemaAfter)) {
      const stored: Row = {};
      const read: Row = {};
      for (const field of table.fields.values()) {
        const value = field.generated ? { stored: 1, read: 1 } : seedValue(field);
        stored[field.name] = value.stored;
        read[field.name] = value.read;
      }
      storedRows.set(table.logical, referencing(table, storedRows, stored));
      expected.set(table.logical, referencing(table, expected, read));
      const row = storedRows.get(table.logical) as Row;
      const fields = [...table.fields.values()];
      await db.execute(
        `INSERT INTO ${quote(table.physical)} (${fields.map((field) => quote(field.column)).join(', ')}) ` +
          `VALUES (${fields.map((field) => literal(row[field.name])).join(', ')})`,
      );
    }
  } finally {
    await db.execute('PRAGMA ignore_check_constraints = OFF');
  }
  return { expected };
}

/** The tables of `schema` in the order the history created them (parents before children). */
export function tablesInOrder(storage: CompiledPluginStorage, schema: CompiledSchema): CompiledTable[] {
  const byPhysical = new Map([...schema.values()].map((table) => [table.physical, table]));
  return storage.ownedTables.flatMap((physical) => byPhysical.get(physical) ?? []);
}

/** A row for every head table that has no CHECK constraint of the 1.x layout, referencing rows written before it. */
export function writeRow(table: CompiledTable, written: ReadonlyMap<string, Row>): Row {
  const row: Row = {};
  for (const field of table.fields.values()) if (!field.generated) row[field.name] = writeValue(field);
  return referencing(table, written, row);
}

/** The DDL a 1.x installation ran, and its complete (or deliberately incomplete) TypeORM history. */
export async function seedLegacyInstallation(
  db: StorageDatabase,
  plugin: BundledPluginStorage,
  applied: readonly string[] = plugin.storage.adoption?.legacyMigrations ?? [],
): Promise<void> {
  for (const statement of plugin.legacySql) await db.execute(statement);
  const legacy = quote(legacyMigrationsTableName(plugin.name));
  await db.execute(
    `CREATE TABLE ${legacy} ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL, "name" varchar NOT NULL)`,
  );
  for (const [index, name] of applied.entries()) {
    await db.execute(`INSERT INTO ${legacy} ("timestamp", "name") VALUES (${1700000000000 + index}, ${literal(name)})`);
  }
}

/** Accepted differences between a 1.x layout and the host's DDL for it, besides column order. */
export interface LayoutDeviations {
  /** Indexes only the 1.x layout has (partial or expression unique indexes the neutral schema cannot declare). */
  readonly legacyOnlyIndexes?: readonly string[];
  /** `table -> column -> reason`: columns whose 1.x type differs (Matter's blob kept as base64 text). */
  readonly columnTypes?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** The SQLite type affinity class of a declared type: varchar(n), varchar and text are one; bigint and integer too. */
function typeClass(declared: string): string {
  const type = declared.toLowerCase();
  if (/int/.test(type)) return 'integer';
  if (/char|text|clob/.test(type)) return 'text';
  return type.replace(/\(.*\)$/, '');
}

/** `('x')`, `'x'`, `(0)` and `0` are one default; any expression of the current time is `now`. */
function defaultOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  if (/now/i.test(text)) return 'now';
  return text.replace(/^\((.*)\)$/s, '$1').replace(/^'(.*)'$/s, '$1');
}

/**
 * The layout of `tables` as SQLite reports it, normalised for comparison: column set with type class, nullability,
 * key position and default; index shapes (unique, partial, columns) with the names of created indexes; foreign keys.
 */
export async function layoutOf(
  db: StorageDatabase,
  tables: readonly string[],
  deviations: LayoutDeviations = {},
): Promise<Record<string, unknown>> {
  const layout: Record<string, unknown> = {};
  const skip = new Set(deviations.legacyOnlyIndexes ?? []);
  for (const table of [...tables].sort()) {
    const name = literal(table);
    const columns = await db.committed(`SELECT * FROM pragma_table_info(${name}) ORDER BY name`);
    const indexes = await db.committed(
      `SELECT il.name, il."unique", il.origin, il.partial, group_concat(ii.name, ',') AS columns
         FROM pragma_index_list(${name}) il JOIN pragma_index_info(il.name) ii
        WHERE il.origin != 'pk' GROUP BY il.name ORDER BY il.name`,
    );
    const keys = await db.committed(`SELECT "table", "from", "to", on_delete FROM pragma_foreign_key_list(${name})`);
    const typeDeviations = deviations.columnTypes?.[table] ?? {};
    layout[table] = {
      columns: columns.map((column) => ({
        name: column.name,
        type: column.name in typeDeviations ? 'text' : typeClass(String(column.type)),
        notNull: Number(column.notnull) === 1,
        primaryKey: Number(column.pk),
        default: defaultOf(column.dflt_value),
      })),
      indexes: indexes
        .filter((index) => !skip.has(String(index.name)))
        .map(
          (index) =>
            `${Number(index.unique) ? 'unique' : 'plain'}|${Number(index.partial) ? 'partial' : 'full'}|${String(index.columns)}`,
        )
        .sort(),
      // A 1.x UNIQUE constraint has an automatic name; created indexes must keep theirs (later steps drop them by name).
      namedIndexes: indexes
        .filter((index) => index.origin === 'c' && !skip.has(String(index.name)))
        .map((index) => String(index.name))
        .sort(),
      foreignKeys: keys.map((key) => `${key.from}->${key.table}.${key.to} ${key.on_delete}`).sort(),
    };
  }
  return layout;
}
