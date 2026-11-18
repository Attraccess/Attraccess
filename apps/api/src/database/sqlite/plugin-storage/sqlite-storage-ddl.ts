import type { PluginStorageDdl } from '../../../plugin-system/plugin-storage/storage-dialect.port';
import { defaultInputOf } from '../../../plugin-system/plugin-storage/storage-compile';
import type { CompiledField, CompiledTable, ResolvedStep } from '../../../plugin-system/plugin-storage/storage-model';
import { normalizeValue } from '../../../plugin-system/plugin-storage/storage-values';
import { sqliteStorageDialect } from './sqlite-storage-dialect';

const { quote } = sqliteStorageDialect;

const NOW_DEFAULT = `(strftime('%Y-%m-%d %H:%M:%f', 'now'))`;

const COLUMN_TYPES: Record<Exclude<CompiledField['type'], 'string'>, string> = {
  uuid: 'varchar(36)',
  text: 'text',
  json: 'text',
  integer: 'integer',
  decimal: 'integer', // a scaled integer, see the dialect
  boolean: 'boolean',
  timestamp: 'datetime',
  date: 'date',
};

function columnType(field: CompiledField): string {
  return field.type === 'string' ? `varchar(${field.length ?? 255})` : COLUMN_TYPES[field.type];
}

function literal(value: unknown): string {
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function defaultClause(field: CompiledField): string {
  const value = field.default;
  if (value === undefined) return '';
  if (value === null) return ' DEFAULT NULL';
  if (typeof value === 'object') return ` DEFAULT ${NOW_DEFAULT}`;
  const canonical = normalizeValue(field, defaultInputOf(field, value));
  // A bare literal (not a parenthesised expression): ALTER TABLE ADD COLUMN accepts only constants.
  return ` DEFAULT ${literal(sqliteStorageDialect.encode(field, canonical))}`;
}

function columnDefinition(field: CompiledField, singleGeneratedKey: boolean): string {
  const key = singleGeneratedKey && field.type === 'integer' ? ' PRIMARY KEY AUTOINCREMENT' : '';
  return `${quote(field.column)} ${columnType(field)}${key}${field.nullable ? '' : ' NOT NULL'}${field.generated ? '' : defaultClause(field)}`;
}

function createTable(table: CompiledTable): string[] {
  const fields = [...table.fields.values()];
  const generatedKey = fields.find((field) => field.generated && field.type === 'integer');
  const parts = fields.map((field) => columnDefinition(field, field === generatedKey));
  if (!generatedKey) {
    const columns = table.primaryKey.map((name) => quote((table.fields.get(name) as CompiledField).column));
    parts.push(`PRIMARY KEY (${columns.join(', ')})`);
  }
  for (const fk of table.foreignKeys) {
    const own = fk.fields.map((name) => quote((table.fields.get(name) as CompiledField).column));
    const action = fk.onDelete
      ? ` ON DELETE ${fk.onDelete === 'set-null' ? 'SET NULL' : fk.onDelete.toUpperCase()}`
      : '';
    parts.push(
      `FOREIGN KEY (${own.join(', ')}) REFERENCES ${quote(fk.referencesPhysical)} (${fk.referencedColumns.map(quote).join(', ')})${action}`,
    );
  }
  return [
    `CREATE TABLE ${quote(table.physical)} (${parts.join(', ')})`,
    ...table.indexes.map((index) => createIndex(table, index)),
  ];
}

function createIndex(table: CompiledTable, index: CompiledTable['indexes'][number]): string {
  const columns = index.fields.map((name) => quote((table.fields.get(name) as CompiledField).column));
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(table.physical)} (${columns.join(', ')})`;
}

type StepStatements = { [Op in ResolvedStep['op']]: (step: Extract<ResolvedStep, { op: Op }>) => string[] };

const STATEMENTS: StepStatements = {
  createTable: (step) => createTable(step.table),
  dropTable: (step) => [`DROP TABLE ${quote(step.table.physical)}`],
  addColumn: (step) => [`ALTER TABLE ${quote(step.table.physical)} ADD COLUMN ${columnDefinition(step.field, false)}`],
  dropColumn: (step) => [`ALTER TABLE ${quote(step.table.physical)} DROP COLUMN ${quote(step.field.column)}`],
  renameColumn: (step) => [
    `ALTER TABLE ${quote(step.table.physical)} RENAME COLUMN ${quote(step.from.column)} TO ${quote(step.to.column)}`,
  ],
  addIndex: (step) => [createIndex(step.table, step.index)],
  dropIndex: (step) => [`DROP INDEX ${quote(step.index.name)}`],
};

/**
 * SQLite statements of the neutral migration steps. Every step maps to an in-place ALTER, CREATE or DROP; the host
 * never rebuilds a table. That is a limit for 1.x tables adopted in place: a UNIQUE or CHECK constraint of their
 * CREATE TABLE cannot be dropped, nor can a column it uses. The migration session refuses such a step before it runs
 * (see sqlite-storage-step-guard).
 */
export const sqliteStorageDdl: PluginStorageDdl = {
  statements(step: ResolvedStep): string[] {
    return (STATEMENTS[step.op] as (step: ResolvedStep) => string[])(step);
  },
};
