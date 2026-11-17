import { DatabaseSync } from 'node:sqlite';
import type { PluginStorageField, PluginStorageTable } from '@attraccess/plugins-backend-sdk';
import { WAGO_LEGACY_MIGRATION_SQL } from './legacy-layout.fixture';
import { WAGO_LEGACY_MIGRATIONS, wagoStorage, wagoTables } from './index';

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}
interface IndexInfo {
  name: string;
  unique: number;
  origin: string;
}
interface ForeignKeyInfo {
  table: string;
  from: string;
  to: string;
  on_delete: string;
}

/** The schema an installed 1.x database has: every legacy migration replayed in order. */
function legacyDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  for (const [, statements] of WAGO_LEGACY_MIGRATION_SQL) for (const statement of statements) db.exec(statement);
  return db;
}

const columnOf = (name: string, field: PluginStorageField) => field.column ?? name;
const physicalName = (definition: PluginStorageTable) => definition.physicalName as string;

/** SQLite affinity of a declared type name; varchar, text, integer and bigint are the 1.x column types. */
function affinity(declared: string): 'text' | 'integer' {
  const upper = declared.toUpperCase();
  if (upper.includes('INT')) return 'integer';
  if (upper.includes('CHAR') || upper.includes('TEXT')) return 'text';
  throw new Error(`Unexpected legacy column type ${declared}`);
}

function declaredAffinity(field: PluginStorageField): 'text' | 'integer' {
  if (field.type === 'integer') return 'integer';
  if (field.type === 'string' || field.type === 'text') return 'text';
  throw new Error(`The 1.x layout has no ${field.type} column`);
}

function defaultLiteral(raw: string | null): string | number | null {
  if (raw === null) return null;
  const unwrapped = raw.replace(/^\(([\s\S]*)\)$/, '$1');
  if (/^'[\s\S]*'$/.test(unwrapped)) return unwrapped.slice(1, -1);
  return Number(unwrapped);
}

const bySorted = <T>(values: T[]) => [...values].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe('WAGO storage baseline against the 1.x migrations', () => {
  const db = legacyDatabase();
  afterAll(() => db.close());

  const tables = Object.entries(wagoTables) as [string, PluginStorageTable][];

  it('declares exactly the tables the legacy migrations leave behind', () => {
    const legacy = (
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as {
        name: string;
      }[]
    ).map(({ name }) => name);
    expect(bySorted(tables.map(([, definition]) => physicalName(definition)))).toEqual(bySorted(legacy));
  });

  it.each(tables)('matches the columns, defaults and keys of %s', (_name, definition) => {
    const table = physicalName(definition);
    const columns = db.prepare(`PRAGMA table_info("${table}")`).all() as unknown as ColumnInfo[];
    const declared = Object.entries(definition.fields).map(([name, field]) => ({
      column: columnOf(name, field),
      notnull: !field.nullable,
      affinity: declaredAffinity(field),
      default: field.hasDefault && !field.generated ? field.default : null,
    }));
    const legacy = columns.map((column) => ({
      column: column.name,
      notnull: column.notnull === 1 || column.pk > 0,
      affinity: affinity(column.type),
      default: defaultLiteral(column.dflt_value),
    }));
    expect(bySorted(declared)).toEqual(bySorted(legacy));

    const primaryKey = columns
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    expect(definition.primaryKey.map((name) => columnOf(name, definition.fields[name]))).toEqual(primaryKey);

    const sql = (
      db.prepare('SELECT sql FROM sqlite_master WHERE type = ? AND name = ?').get('table', table) as { sql: string }
    ).sql;
    const generated = Object.values(definition.fields).some((field) => field.generated);
    expect(/AUTOINCREMENT/i.test(sql)).toBe(generated);
  });

  it.each(tables)('matches the unique keys and indexes of %s', (_name, definition) => {
    const table = physicalName(definition);
    const legacy = (db.prepare(`PRAGMA index_list("${table}")`).all() as unknown as IndexInfo[])
      .filter((index) => index.origin !== 'pk')
      .map((index) => ({
        unique: index.unique === 1,
        columns: (db.prepare(`PRAGMA index_info("${index.name}")`).all() as { name: string }[]).map(
          (column) => column.name,
        ),
      }));
    const declared = definition.indexes.map((index) => ({
      unique: index.unique === true,
      columns: index.fields.map((name) => columnOf(name, definition.fields[name])),
    }));
    expect(bySorted(declared)).toEqual(bySorted(legacy));
  });

  it.each(tables)('matches the foreign keys of %s', (_name, definition) => {
    const table = physicalName(definition);
    const legacy = (db.prepare(`PRAGMA foreign_key_list("${table}")`).all() as unknown as ForeignKeyInfo[]).map(
      (key) => ({ from: key.from, table: key.table, to: key.to, onDelete: key.on_delete.toLowerCase() }),
    );
    const declared = definition.foreignKeys.flatMap((key) =>
      key.fields.map((name, index) => {
        const target = wagoTables[key.references as keyof typeof wagoTables];
        const targetField = key.referencedFields[index];
        return {
          from: columnOf(name, definition.fields[name]),
          table: physicalName(target),
          to: columnOf(targetField, target.fields[targetField]),
          onDelete: key.onDelete === 'cascade' ? 'cascade' : key.onDelete === 'set-null' ? 'set null' : 'restrict',
        };
      }),
    );
    expect(bySorted(declared)).toEqual(bySorted(legacy));
  });

  it('keeps every physical name inside the plugin namespace', () => {
    for (const [, definition] of tables) expect(physicalName(definition)).toMatch(/^plugin_wago_[a-z_]+$/);
  });
});

describe('WAGO storage definition', () => {
  it('adopts a database where all nineteen legacy migrations are applied, in execution order', () => {
    expect(wagoStorage.adoption?.legacyMigrations).toEqual(WAGO_LEGACY_MIGRATIONS);
    expect(WAGO_LEGACY_MIGRATIONS).toHaveLength(19);
    expect(WAGO_LEGACY_MIGRATION_SQL.map(([name]) => name)).toEqual([...WAGO_LEGACY_MIGRATIONS]);
    const timestamps = WAGO_LEGACY_MIGRATIONS.map((name) => Number(/\d+$/.exec(name)?.[0]));
    expect(timestamps).toEqual([...timestamps].sort((a, b) => a - b));
    expect(new Set(WAGO_LEGACY_MIGRATIONS).size).toBe(19);
  });

  it('ships the declared layout as baseline version 1 and creates referenced tables first', () => {
    expect(wagoStorage.migrations.map((migration) => migration.version)).toEqual([1]);
    const created = (wagoStorage.migrations[0].steps ?? []).map((item) =>
      item.op === 'createTable' ? item.table : '',
    );
    expect(created).toEqual(Object.keys(wagoTables));
    for (const item of wagoStorage.migrations[0].steps ?? []) {
      if (item.op !== 'createTable') continue;
      expect(item.definition).toBe(wagoTables[item.table as keyof typeof wagoTables]);
      for (const key of item.definition.foreignKeys)
        expect(created.indexOf(key.references)).toBeLessThan(created.indexOf(item.table));
    }
  });
});
