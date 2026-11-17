// The declared baseline (version 1) must describe exactly the table layout the three 1.x TypeORM migrations produced,
// because an installed database is adopted without running anything. The fixture holds the migrations' DDL verbatim;
// the test builds the resulting schema from it and compares it with the declaration, column by column.
import type { PluginStorageField } from '@attraccess/plugins-backend-sdk';
import { LEGACY_MIGRATION_CLASS_NAMES, LEGACY_UP_STATEMENTS } from '../testing/legacy-migrations.fixture';
import { LEGACY_MIGRATIONS, LEGACY_ONLY_CONSTRAINTS, MATTER_STORAGE, MATTER_TABLES } from './tables';

type Column = { type: string; notNull: boolean; default: string | null };
type Index = { columns: string[]; unique: boolean; partial: boolean };
type Schema = Map<
  string,
  { columns: Map<string, Column>; primaryKey: string[]; indexes: Map<string, Index>; checks: string[] }
>;

const unquote = (text: string) => text.replace(/"/g, '').trim();

/** Splits at commas that are not inside parentheses. */
function topLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function columnOf(definition: string): [string, Column] {
  const match = /^"(\w+)"\s+(\w+(?:\(\d+\))?)(.*)$/s.exec(definition) as RegExpExecArray;
  const rest = match[3];
  const dflt = /DEFAULT\s+('[^']*'|\d+)/.exec(rest);
  return [match[1], { type: match[2], notNull: /NOT NULL/.test(rest), default: dflt ? dflt[1] : null }];
}

/** The schema the legacy migrations leave behind, from their DDL. */
function legacySchema(): Schema {
  const schema: Schema = new Map();
  for (const statement of LEGACY_UP_STATEMENTS) {
    const create = /^CREATE TABLE (?:IF NOT EXISTS )?"(\w+)"\s*\((.*)\)\s*$/s.exec(statement.trim());
    const alter = /^ALTER TABLE "(\w+)" ADD COLUMN (.*)$/s.exec(statement.trim());
    const index = /^CREATE (UNIQUE )?INDEX "(\w+)" ON "(\w+)" \((.*?)\)( WHERE .*)?$/s.exec(statement.trim());
    if (create) {
      const table = {
        columns: new Map<string, Column>(),
        primaryKey: [] as string[],
        indexes: new Map(),
        checks: [] as string[],
      };
      for (const part of topLevel(create[2])) {
        const constraint = /^CONSTRAINT "(\w+)"/.exec(part);
        if (constraint) {
          table.checks.push(constraint[1]);
          continue;
        }
        const [name, column] = columnOf(part);
        if (/PRIMARY KEY/.test(part)) table.primaryKey.push(name);
        table.columns.set(name, column);
      }
      schema.set(create[1], table);
    } else if (alter) {
      const [name, column] = columnOf(alter[2]);
      schema.get(alter[1])?.columns.set(name, column);
    } else if (index) {
      const columns = topLevel(index[4]).map(unquote);
      schema
        .get(index[3])
        ?.indexes.set(index[2], { columns, unique: index[1] !== undefined, partial: index[5] !== undefined });
    } else throw new Error(`unparsed legacy statement: ${statement.slice(0, 60)}`);
  }
  return schema;
}

const sqlType = (field: PluginStorageField): string => {
  if (field.type === 'string') return field.length === undefined ? 'varchar' : `varchar(${field.length})`;
  if (['text', 'integer', 'boolean'].includes(field.type)) return field.type;
  throw new Error(`the Matter layout has no ${field.type} column`);
};

const defaultOf = (field: PluginStorageField): string | null => {
  if (field.default === undefined) return null;
  return typeof field.default === 'string' ? `'${field.default}'` : String(field.default);
};

describe('Matter storage baseline', () => {
  const legacy = legacySchema();
  const declared = Object.values(MATTER_TABLES);

  it('declares the same tables, under their existing physical names', () => {
    expect(declared.map((table) => table.physicalName).sort()).toEqual([...legacy.keys()].sort());
  });

  it.each(declared.map((table) => [table.physicalName as string, table] as const))(
    '%s: every column has the legacy name, type, nullability and default',
    (name, table) => {
      const columns = legacy.get(name)?.columns as Map<string, Column>;
      const fields = Object.entries(table.fields).map(
        ([field, definition]) => [definition.column ?? field, definition] as const,
      );
      expect(fields.map(([column]) => column).sort()).toEqual([...columns.keys()].sort());
      for (const [column, field] of fields) {
        const old = columns.get(column) as Column;
        // The neutral schema has no binary type: the backup file column was a blob and is declared as base64 text.
        const deviation = (LEGACY_ONLY_CONSTRAINTS.columnTypeDeviations as Record<string, Record<string, string>>)[
          name
        ]?.[column];
        const expectedType = deviation ? 'blob' : sqlType(field);
        expect({ column, type: deviation ? 'blob' : old.type }).toEqual({ column, type: expectedType });
        if (deviation) expect(sqlType(field)).toBe('text');
        // A primary key column is NOT NULL; a legacy column without NOT NULL is the nullable one.
        expect({ column, nullable: !old.notNull }).toEqual({ column, nullable: field.nullable });
        expect({ column, default: old.default }).toEqual({ column, default: defaultOf(field) });
      }
    },
  );

  it.each(declared.map((table) => [table.physicalName as string, table] as const))(
    '%s: primary key and plain indexes match; the rest is the listed legacy-only set',
    (name, table) => {
      const old = legacy.get(name) as Schema extends Map<string, infer T> ? T : never;
      const columnOf = (field: string) => table.fields[field].column ?? field;
      expect(table.primaryKey.map(columnOf)).toEqual(old.primaryKey);
      const plain = [...old.indexes].filter(([, index]) => !index.partial && !index.columns.includes('(1)'));
      expect(
        (table.indexes ?? []).map((index) => [index.name, index.fields.map(columnOf), index.unique === true]),
      ).toEqual(plain.map(([indexName, index]) => [indexName, index.columns, index.unique]));
    },
  );

  it('leaves out only the partial and expression indexes and the CHECK constraints it lists as legacy-only', () => {
    const partial = [...legacy.values()].flatMap((table) =>
      [...table.indexes].filter(([, index]) => index.partial).map(([name]) => name),
    );
    const checks = [...legacy.values()].flatMap((table) => table.checks);
    expect(partial.sort()).toEqual([...LEGACY_ONLY_CONSTRAINTS.partialUniqueIndexes].sort());
    expect(checks.sort()).toEqual([...LEGACY_ONLY_CONSTRAINTS.checkConstraints].sort());
  });

  it('makes version 1 the baseline: it creates every declared table with its declared layout', () => {
    const [baseline, ...later] = MATTER_STORAGE.migrations;
    expect(later).toEqual([]);
    expect(baseline.version).toBe(1);
    const created = Object.fromEntries(
      (baseline.steps ?? []).map((step) => (step.op === 'createTable' ? [step.table, step.definition] : ['', null])),
    );
    expect(created).toEqual(MATTER_TABLES);
  });

  it('adopts a database that ran all three legacy migrations, by the names the 1.x plugin recorded', () => {
    expect(MATTER_STORAGE.adoption?.legacyMigrations).toEqual(LEGACY_MIGRATION_CLASS_NAMES);
    expect(LEGACY_MIGRATIONS).toEqual(LEGACY_MIGRATION_CLASS_NAMES);
  });
});
