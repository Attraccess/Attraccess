import type { PluginStorageDdl } from '../../../plugin-system/plugin-storage/storage-dialect.port';
import { defaultInputOf } from '../../../plugin-system/plugin-storage/storage-compile';
import type { CompiledField, CompiledTable, ResolvedStep } from '../../../plugin-system/plugin-storage/storage-model';
import { normalizeValue } from '../../../plugin-system/plugin-storage/storage-values';
import { sqliteStorageDialect } from './sqlite-storage-dialect';

const { quote } = sqliteStorageDialect;

const NOW_DEFAULT = `(strftime('%Y-%m-%d %H:%M:%f', 'now'))`;

function columnType(field: CompiledField): string {
  switch (field.type) {
    case 'string':
      return `varchar(${field.length ?? 255})`;
    case 'uuid':
      return 'varchar(36)';
    case 'text':
    case 'json':
      return 'text';
    case 'integer':
    case 'decimal': // a scaled integer, see the dialect
      return 'integer';
    case 'boolean':
      return 'boolean';
    case 'timestamp':
      return 'datetime';
    case 'date':
      return 'date';
  }
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
    const action = fk.onDelete ? ` ON DELETE ${fk.onDelete === 'set-null' ? 'SET NULL' : fk.onDelete.toUpperCase()}` : '';
    parts.push(
      `FOREIGN KEY (${own.join(', ')}) REFERENCES ${quote(fk.referencesPhysical)} (${fk.referencedFields.map(quote).join(', ')})${action}`,
    );
  }
  return [`CREATE TABLE ${quote(table.physical)} (${parts.join(', ')})`, ...table.indexes.map((index) => createIndex(table, index))];
}

function createIndex(table: CompiledTable, index: CompiledTable['indexes'][number]): string {
  const columns = index.fields.map((name) => quote((table.fields.get(name) as CompiledField).column));
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${quote(index.name)} ON ${quote(table.physical)} (${columns.join(', ')})`;
}

/** SQLite statements of the neutral migration steps. Table rebuilds are never needed: SQLite alters in place. */
export const sqliteStorageDdl: PluginStorageDdl = {
  statements(step: ResolvedStep): string[] {
    switch (step.op) {
      case 'createTable':
        return createTable(step.table);
      case 'dropTable':
        return [`DROP TABLE ${quote(step.table.physical)}`];
      case 'addColumn':
        return [`ALTER TABLE ${quote(step.table.physical)} ADD COLUMN ${columnDefinition(step.field, false)}`];
      case 'dropColumn':
        return [`ALTER TABLE ${quote(step.table.physical)} DROP COLUMN ${quote(step.field.column)}`];
      case 'renameColumn':
        return [
          `ALTER TABLE ${quote(step.table.physical)} RENAME COLUMN ${quote(step.from.column)} TO ${quote(step.to.column)}`,
        ];
      case 'addIndex':
        return [createIndex(step.table, step.index)];
      case 'dropIndex':
        return [`DROP INDEX ${quote(step.index.name)}`];
    }
  },
};
