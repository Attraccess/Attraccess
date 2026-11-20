// Test helper: compares a declared storage baseline with the DDL the 1.x TypeORM migrations ran.
//
// The legacy migrations are gone, so the tests keep their SQL as a fixture (copied verbatim) and this helper reads
// the statements into a neutral layout (columns, primary key, unique constraints, indexes) that is then compared
// with the declaration: column names, types, nullability, defaults, key, indexes and uniques must match exactly,
// because an adopted installation keeps its tables untouched.
import type { PluginStorageDefinition, PluginStorageField, PluginStorageTable } from '@attraccess/plugins-backend-sdk';

export interface LegacyColumn {
  name: string;
  type: string;
  notNull: boolean;
  /** Default as written in the DDL, parentheses and quotes removed. */
  default: string | null;
  primaryKey: boolean;
  autoIncrement: boolean;
}

export interface LegacyTable {
  name: string;
  columns: LegacyColumn[];
  /** Index and unique-constraint shapes, `name|unique|col1,col2`. */
  indexes: string[];
}

const stripQuotes = (value: string) => value.replace(/^"(.*)"$/, '$1');

/** Splits on commas outside parentheses and quotes. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = false;
  let current = '';
  for (const char of body) {
    if (char === "'") quote = !quote;
    if (!quote && char === '(') depth += 1;
    if (!quote && char === ')') depth -= 1;
    if (!quote && depth === 0 && char === ',') {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseDefault(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const value = raw.trim().replace(/^\((.*)\)$/, '$1');
  return value.replace(/^'(.*)'$/, '$1');
}

function parseColumn(definition: string): LegacyColumn {
  const match = /^"([^"]+)"\s+(\w+)(.*)$/s.exec(definition);
  if (!match) throw new Error(`Unparsable legacy column: ${definition}`);
  const rest = match[3];
  const defaultMatch = /DEFAULT\s+(\(.*\)|'[^']*'|\S+)/i.exec(rest);
  return {
    name: match[1],
    type: match[2].toLowerCase(),
    notNull: /NOT NULL/i.test(rest),
    default: parseDefault(defaultMatch?.[1]),
    primaryKey: /PRIMARY KEY/i.test(rest),
    autoIncrement: /AUTOINCREMENT/i.test(rest),
  };
}

/** Parses the CREATE TABLE / CREATE INDEX statements of the legacy migrations into neutral layouts. */
export function parseLegacyDdl(statements: readonly string[]): Record<string, LegacyTable> {
  const tables: Record<string, LegacyTable> = {};
  for (const statement of statements) {
    const create = /CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"\s*\((.*)\)\s*$/s.exec(statement.trim());
    if (create) {
      const table: LegacyTable = { name: create[1], columns: [], indexes: [] };
      for (const part of splitTopLevel(create[2])) {
        const constraint = /^CONSTRAINT "([^"]+)" UNIQUE \((.*)\)$/s.exec(part);
        if (constraint) {
          table.indexes.push(`${constraint[1]}|unique|${splitTopLevel(constraint[2]).map(stripQuotes).join(',')}`);
        } else {
          table.columns.push(parseColumn(part));
        }
      }
      tables[table.name] = table;
      continue;
    }
    const index = /CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?"([^"]+)" ON "([^"]+)" \((.*)\)\s*$/s.exec(
      statement.trim(),
    );
    if (!index) throw new Error(`Unrecognised legacy statement: ${statement}`);
    const owner = tables[index[3]];
    if (!owner) throw new Error(`Index ${index[2]} on unknown table ${index[3]}`);
    owner.indexes.push(
      `${index[2]}|${index[1] ? 'unique' : 'plain'}|${splitTopLevel(index[4]).map(stripQuotes).join(',')}`,
    );
  }
  return tables;
}

const LEGACY_TYPE: Record<PluginStorageField['type'], string> = {
  string: 'varchar',
  text: 'text',
  integer: 'integer',
  decimal: 'decimal',
  boolean: 'boolean',
  timestamp: 'datetime',
  date: 'date',
  json: 'text',
  uuid: 'varchar',
};

function declaredDefault(field: PluginStorageField): string | null {
  if (field.default === undefined || field.default === null) return null;
  if (typeof field.default === 'object') return 'now';
  if (typeof field.default === 'boolean') return field.default ? '1' : '0';
  return String(field.default);
}

/** The neutral layout of a declared table in the same shape {@link parseLegacyDdl} produces. */
export function describeDeclaredTable(physicalName: string, declared: PluginStorageTable): LegacyTable {
  const columnOf = (fieldName: string) => declared.fields[fieldName].column ?? fieldName;
  const columns = Object.entries(declared.fields).map(([fieldName, field]) => ({
    name: columnOf(fieldName),
    type: LEGACY_TYPE[field.type],
    notNull: !field.nullable,
    default: field.generated ? null : declaredDefault(field),
    primaryKey: declared.primaryKey.includes(fieldName),
    autoIncrement: field.generated === true && field.type === 'integer',
  }));
  const indexes = declared.indexes.map(
    (index) => `${index.name}|${index.unique ? 'unique' : 'plain'}|${index.fields.map(columnOf).join(',')}`,
  );
  return { name: physicalName, columns, indexes };
}

/**
 * A `text` field matches an unbounded legacy `varchar`: the 1.x SQLite database stored both as TEXT without a length
 * check, so the imported column is the same. Declarations use `text` where a value can exceed the 255 characters a `string` field
 * enforces, so both sides compare as `text`.
 */
const storageClassOf = (type: string) => (type === 'varchar' ? 'text' : type);

/** Parsed legacy tables and declared tables, ready for `toEqual`. Both sides are sorted by table name. */
export function compareBaselineWithLegacy(definition: PluginStorageDefinition, legacyStatements: readonly string[]) {
  const legacy = parseLegacyDdl(legacyStatements);
  const declared = Object.fromEntries(
    Object.entries(definition.tables).map(([logical, tableDefinition]) => {
      const physical = tableDefinition.physicalName ?? logical;
      return [physical, describeDeclaredTable(physical, tableDefinition)];
    }),
  );
  const normalise = (tables: Record<string, LegacyTable>) =>
    Object.fromEntries(
      Object.keys(tables)
        .sort()
        .map((name) => [
          name,
          {
            ...tables[name],
            columns: tables[name].columns.map((column) => ({ ...column, type: storageClassOf(column.type) })),
            indexes: [...tables[name].indexes].sort(),
          },
        ]),
    );
  return { legacy: normalise(legacy), declared: normalise(declared) };
}
