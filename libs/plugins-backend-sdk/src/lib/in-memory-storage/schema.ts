import {
  PluginStorageInvalid,
  type PluginStorageDefinition,
  type PluginStorageField,
  type PluginStorageForeignKey,
  type PluginStorageTable,
} from '../plugin-storage';
import { normalizeValue } from './values';

/** A declared table with the lookups the in-memory engine needs. */
export interface TableMeta {
  readonly name: string;
  readonly fields: Readonly<Record<string, PluginStorageField>>;
  readonly fieldNames: readonly string[];
  readonly primaryKey: readonly string[];
  /** The primary key followed by every unique index: each is a unique key. */
  readonly uniqueKeys: readonly (readonly string[])[];
  readonly foreignKeys: readonly PluginStorageForeignKey[];
}

function requireFields(
  table: string,
  kind: string,
  declared: Record<string, PluginStorageField>,
  names: readonly string[],
) {
  for (const name of names) {
    if (!(name in declared)) throw new PluginStorageInvalid(`${table}: ${kind} names the undeclared field "${name}".`);
  }
}

function validateDefaults(table: string, fields: Record<string, PluginStorageField>): void {
  for (const [name, field] of Object.entries(fields)) {
    const value = field.default;
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      if (field.type !== 'timestamp') throw new PluginStorageInvalid(`${table}.${name}: "now" is for timestamps only.`);
      continue;
    }
    normalizeValue(`${table}.${name} default`, field, value);
  }
}

function validateTable(name: string, table: PluginStorageTable): TableMeta {
  const fieldNames = Object.keys(table.fields);
  if (fieldNames.length === 0) throw new PluginStorageInvalid(`${name}: a table needs at least one field.`);
  if (table.primaryKey.length === 0) throw new PluginStorageInvalid(`${name}: a table needs a primary key.`);
  requireFields(name, 'the primary key', table.fields, table.primaryKey);
  for (const key of table.primaryKey) {
    if (table.fields[key].nullable)
      throw new PluginStorageInvalid(`${name}.${key}: a primary key field is not nullable.`);
  }
  for (const [fieldName, field] of Object.entries(table.fields)) {
    if (field.generated && (!table.primaryKey.includes(fieldName) || table.primaryKey.length !== 1)) {
      throw new PluginStorageInvalid(`${name}.${fieldName}: only a single-field primary key can be generated.`);
    }
  }
  for (const index of table.indexes) requireFields(name, 'an index', table.fields, index.fields);
  validateDefaults(name, table.fields);
  return {
    name,
    fields: table.fields,
    fieldNames,
    primaryKey: table.primaryKey,
    uniqueKeys: [table.primaryKey, ...table.indexes.filter((index) => index.unique).map((index) => index.fields)],
    foreignKeys: table.foreignKeys,
  };
}

const sameFields = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((name) => b.includes(name));

function validateForeignKey(metas: Map<string, TableMeta>, meta: TableMeta, fk: PluginStorageForeignKey): void {
  const label = `${meta.name}: foreign key (${fk.fields.join(', ')})`;
  const parent = metas.get(fk.references);
  if (!parent) throw new PluginStorageInvalid(`${label} references the unknown table "${fk.references}".`);
  requireFields(meta.name, 'a foreign key', meta.fields, fk.fields);
  requireFields(fk.references, 'a referenced key', parent.fields, fk.referencedFields);
  if (fk.fields.length !== fk.referencedFields.length) {
    throw new PluginStorageInvalid(`${label} must list as many referenced fields as fields.`);
  }
  if (!parent.uniqueKeys.some((key) => sameFields(key, fk.referencedFields))) {
    throw new PluginStorageInvalid(`${label} must reference a primary or unique key of "${fk.references}".`);
  }
  fk.fields.forEach((name, i) => {
    if (meta.fields[name].type !== parent.fields[fk.referencedFields[i]].type) {
      throw new PluginStorageInvalid(`${label}: the field types differ from the referenced fields.`);
    }
  });
}

/** Validates a storage definition the way the host does and returns its tables by logical name. */
export function buildTableMetas(definition: PluginStorageDefinition): Map<string, TableMeta> {
  const metas = new Map<string, TableMeta>();
  for (const [name, table] of Object.entries(definition.tables)) metas.set(name, validateTable(name, table));
  for (const meta of metas.values()) {
    for (const fk of meta.foreignKeys) validateForeignKey(metas, meta, fk);
  }
  return metas;
}
