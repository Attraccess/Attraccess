import { createHash } from 'crypto';
import type {
  PluginStorageDefault,
  PluginStorageField,
  PluginStorageFieldType,
  PluginStorageIndex,
  PluginStorageTable,
} from '@attraccess/plugins-backend-sdk';
import {
  type CompiledField,
  type CompiledForeignKey,
  type CompiledIndex,
  type CompiledTable,
  PluginStorageDeclarationError,
} from './storage-model';
import { MAX_DECIMAL_PRECISION, normalizeValue } from './storage-values';

/** Resolution of names for one plugin: the namespace rules every physical identifier must obey. */
export interface StorageNaming {
  readonly pluginName: string;
  readonly namespace: string;
  /** Tables and indexes that exist outside the plugin (core tables); a plugin may not claim them. */
  readonly reservedTables: ReadonlySet<string>;
  /**
   * Namespaces of the other installed plugins. A namespace is a plain name prefix, so the namespace of `qaiso` is a
   * prefix of the one of `qaiso-extra`: the plugin with the shorter namespace may not take a name inside the longer one.
   */
  readonly siblingNamespaces?: ReadonlySet<string>;
}

const FIELD_TYPES: readonly PluginStorageFieldType[] = [
  'string',
  'text',
  'integer',
  'decimal',
  'boolean',
  'timestamp',
  'date',
  'json',
  'uuid',
];
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
/** Words a field may not be called: they are the combinators of a filter. */
const RESERVED_FIELDS = new Set(['and', 'or', 'not']);
const RESERVED_TABLE_PREFIXES = ['plugin_migrations_', 'plugin_storage_migrations_', 'sqlite_'];
const MAX_IDENTIFIER_LENGTH = 63;
const ON_DELETE_ACTIONS: readonly unknown[] = ['cascade', 'restrict', 'set-null'];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function fail(naming: StorageNaming, message: string): never {
  throw new PluginStorageDeclarationError(naming.pluginName, message);
}

/** Lowercase identifier derived from a plugin name; throws when nothing usable is left. */
export function namespaceOf(pluginName: string): string {
  const namespace = pluginName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(namespace)) {
    throw new PluginStorageDeclarationError(pluginName, 'the plugin name cannot be turned into a storage namespace');
  }
  return namespace;
}

const snake = (name: string): string => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

/** The default physical table name of a logical table: `plugin_<plugin>_<table>`. */
export const derivedTableName = (naming: StorageNaming, logical: string): string =>
  `plugin_${naming.namespace}_${snake(logical)}`;

/** The physical table name: the adopted name when declared (inside the namespace), otherwise the derived one. */
export function physicalTableName(naming: StorageNaming, logical: string, explicit: unknown): string {
  if (!IDENTIFIER.test(logical)) fail(naming, `table name "${logical}" must match ${IDENTIFIER.source}`);
  const name = explicit === undefined ? derivedTableName(naming, logical) : explicit;
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
    return fail(naming, `physicalName of table "${logical}" must match ${IDENTIFIER.source}`);
  }
  const lowered = name.toLowerCase();
  if (explicit !== undefined) {
    const inside = lowered.startsWith(`plugin_${naming.namespace}_`) || lowered.startsWith(`${naming.namespace}_`);
    if (!inside) {
      fail(naming, `physicalName "${name}" must start with "plugin_${naming.namespace}_" or "${naming.namespace}_"`);
    }
  }
  const claimedBy = [...(naming.siblingNamespaces ?? [])].find(
    (other) =>
      other.startsWith(`${naming.namespace}_`) && (lowered.startsWith(`plugin_${other}_`) || lowered.startsWith(`${other}_`)),
  );
  if (claimedBy !== undefined) {
    fail(naming, `table name "${name}" lies in the storage namespace "${claimedBy}" of another installed plugin`);
  }
  if (RESERVED_TABLE_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    fail(naming, `table name "${name}" uses a prefix the host reserves`);
  }
  if (naming.reservedTables.has(lowered) || naming.reservedTables.has(name)) {
    fail(naming, `table name "${name}" belongs to the host`);
  }
  return name;
}

function indexName(
  naming: StorageNaming,
  table: string,
  fields: readonly string[],
  unique: boolean,
  given: unknown,
): string {
  if (given !== undefined) return checkedIndexName(naming, given);
  const generated = `${unique ? 'uq' : 'idx'}_${table}_${fields.join('_')}`;
  if (generated.length <= MAX_IDENTIFIER_LENGTH) return generated;
  const digest = createHash('sha1').update(generated).digest('hex').slice(0, 10);
  return `${generated.slice(0, MAX_IDENTIFIER_LENGTH - 11)}_${digest}`;
}

function checkedIndexName(naming: StorageNaming, given: unknown): string {
  if (typeof given !== 'string' || !IDENTIFIER.test(given) || !given.toLowerCase().includes(naming.namespace)) {
    fail(naming, `index name "${String(given)}" must match ${IDENTIFIER.source} and contain "${naming.namespace}"`);
  }
  return given;
}

function readStringList(naming: StorageNaming, where: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== 'string')) {
    fail(naming, `${where} must be a non-empty list of field names`);
  }
  return [...(value as string[])];
}

export function compileField(naming: StorageNaming, tableLabel: string, name: string, decl: unknown): CompiledField {
  const where = `${tableLabel}.${name}`;
  if (!FIELD_NAME.test(name) || RESERVED_FIELDS.has(name)) fail(naming, `field name "${where}" is not allowed`);
  if (!isRecord(decl)) return fail(naming, `field ${where} must be built with the f.* constructors`);
  const type = decl.type as PluginStorageFieldType;
  if (!FIELD_TYPES.includes(type)) fail(naming, `field ${where} has an unknown type "${String(decl.type)}"`);
  const column = decl.column === undefined ? name : decl.column;
  if (typeof column !== 'string' || !FIELD_NAME.test(column)) fail(naming, `column of field ${where} is not allowed`);
  const generated = decl.generated === true;
  if (generated && type !== 'integer' && type !== 'uuid')
    fail(naming, `generated field ${where} must be an integer or uuid`);
  const field: CompiledField = {
    name,
    column: column as string,
    type,
    nullable: decl.nullable === true,
    hasDefault: decl.hasDefault === true || generated,
    default: decl.default as PluginStorageDefault | undefined,
    length: decl.length as number | undefined,
    precision: decl.precision as number | undefined,
    scale: decl.scale as number | undefined,
    generated,
  };
  checkOptions(naming, where, field);
  checkDefault(naming, where, field);
  return field;
}

function checkOptions(naming: StorageNaming, where: string, field: CompiledField): void {
  if (field.length !== undefined && (field.type !== 'string' || !Number.isInteger(field.length) || field.length < 1)) {
    fail(naming, `length of ${where} must be a positive integer on a string field`);
  }
  if (field.type === 'decimal') checkDecimal(naming, where, field);
  else if (field.precision !== undefined || field.scale !== undefined) {
    fail(naming, `precision and scale of ${where} apply to decimal fields only`);
  }
}

function checkDecimal(naming: StorageNaming, where: string, { precision, scale }: CompiledField): void {
  const valid =
    Number.isInteger(precision) &&
    Number.isInteger(scale) &&
    (precision as number) >= 1 &&
    (precision as number) <= MAX_DECIMAL_PRECISION &&
    (scale as number) >= 0 &&
    (scale as number) <= (precision as number);
  if (!valid) {
    fail(naming, `decimal ${where} needs 1 <= precision <= ${MAX_DECIMAL_PRECISION} and 0 <= scale <= precision`);
  }
}

function checkDefault(naming: StorageNaming, where: string, field: CompiledField): void {
  const value = field.default;
  if (value === undefined) return;
  if (field.generated) fail(naming, `generated field ${where} cannot have a default`);
  if (value === null) {
    if (!field.nullable) fail(naming, `required field ${where} cannot default to null`);
    return;
  }
  if (typeof value === 'object') {
    if (field.type !== 'timestamp' || (value as { now?: unknown }).now !== true) {
      fail(naming, `default of ${where} is not valid`);
    }
    return;
  }
  checkLiteralDefault(naming, where, field, value);
}

function checkLiteralDefault(
  naming: StorageNaming,
  where: string,
  field: CompiledField,
  value: string | number | boolean,
): void {
  try {
    normalizeValue(field, defaultInputOf(field, value), where);
  } catch (error) {
    fail(naming, `default of ${where} is not valid: ${(error as Error).message}`);
  }
}

/** The value a literal default stands for: JSON defaults are JSON text, timestamp defaults are ISO strings. */
export function defaultInputOf(field: CompiledField, value: string | number | boolean): unknown {
  if (field.type === 'json') return JSON.parse(String(value));
  if (field.type === 'timestamp') return new Date(String(value));
  return value;
}

export function compileTable(
  naming: StorageNaming,
  logical: string,
  decl: unknown,
  physical: string,
  physicalOf: (logical: string) => string | undefined,
): CompiledTable {
  if (!isRecord(decl) || !isRecord(decl.fields)) return fail(naming, `table "${logical}" must be built with table()`);
  const fields = compileFields(naming, logical, decl.fields);
  const primaryKey = readStringList(naming, `primaryKey of "${logical}"`, decl.primaryKey);
  checkPrimaryKey(naming, logical, fields, primaryKey);
  const indexes = compileIndexes(naming, logical, physical, fields, decl.indexes as PluginStorageIndex[] | undefined);
  const foreignKeys = ((decl.foreignKeys as PluginStorageTable['foreignKeys'] | undefined) ?? []).map((fk) =>
    compileForeignKey(naming, logical, fields, fk, physicalOf),
  );
  return { logical, physical, fields, primaryKey, indexes, foreignKeys };
}

function compileFields(naming: StorageNaming, logical: string, declared: Record<string, unknown>) {
  const fields = new Map<string, CompiledField>();
  for (const [name, field] of Object.entries(declared)) fields.set(name, compileField(naming, logical, name, field));
  if (fields.size === 0) fail(naming, `table "${logical}" declares no fields`);
  const columns = new Set<string>();
  for (const field of fields.values()) {
    if (columns.has(field.column)) fail(naming, `table "${logical}" maps two fields to column "${field.column}"`);
    columns.add(field.column);
  }
  return fields;
}

function checkPrimaryKey(
  naming: StorageNaming,
  logical: string,
  fields: ReadonlyMap<string, CompiledField>,
  primaryKey: readonly string[],
): void {
  for (const key of primaryKey) {
    const field = fields.get(key);
    if (!field) fail(naming, `primaryKey of "${logical}" names the unknown field "${key}"`);
    if (field?.nullable) fail(naming, `primary key field "${logical}.${key}" cannot be nullable`);
  }
  const generated = [...fields.values()].filter((field) => field.generated);
  if (
    generated.length > 1 ||
    (generated.length === 1 && (primaryKey.length !== 1 || primaryKey[0] !== generated[0].name))
  ) {
    fail(naming, `table "${logical}": a generated field must be the whole primary key`);
  }
}

function compileIndexes(
  naming: StorageNaming,
  logical: string,
  physical: string,
  fields: ReadonlyMap<string, CompiledField>,
  declared: PluginStorageIndex[] | undefined,
): CompiledIndex[] {
  const indexes = (declared ?? []).map((index) => compileIndex(naming, logical, physical, fields, index));
  const names = new Set<string>();
  for (const index of indexes) {
    const key = index.name.toLowerCase();
    if (names.has(key)) fail(naming, `table "${logical}" declares the index "${index.name}" twice`);
    names.add(key);
  }
  return indexes;
}

function compileIndex(
  naming: StorageNaming,
  logical: string,
  physical: string,
  fields: ReadonlyMap<string, CompiledField>,
  index: PluginStorageIndex,
): CompiledIndex {
  if (!isRecord(index)) return fail(naming, `an index of "${logical}" is malformed`);
  const list = readStringList(naming, `an index of "${logical}"`, index.fields);
  for (const name of list)
    if (!fields.has(name)) fail(naming, `an index of "${logical}" names the unknown field "${name}"`);
  const unique = index.unique === true;
  return { name: indexName(naming, physical, list, unique, index.name), fields: list, unique };
}

function compileForeignKey(
  naming: StorageNaming,
  logical: string,
  fields: ReadonlyMap<string, CompiledField>,
  fk: PluginStorageTable['foreignKeys'][number],
  physicalOf: (logical: string) => string | undefined,
): CompiledForeignKey {
  if (!isRecord(fk)) return fail(naming, `a foreign key of "${logical}" is malformed`);
  const own = readStringList(naming, `a foreign key of "${logical}"`, fk.fields);
  const referenced = readStringList(naming, `a foreign key of "${logical}"`, fk.referencedFields);
  for (const name of own)
    if (!fields.has(name)) fail(naming, `a foreign key of "${logical}" names the unknown field "${name}"`);
  if (own.length !== referenced.length) fail(naming, `a foreign key of "${logical}" pairs unequal field lists`);
  const references = fk.references;
  const physical = typeof references === 'string' ? physicalOf(references) : undefined;
  if (!physical) {
    return fail(
      naming,
      `a foreign key of "${logical}" references "${String(references)}", which is not a table of this plugin`,
    );
  }
  if (fk.onDelete !== undefined && !ON_DELETE_ACTIONS.includes(fk.onDelete)) {
    fail(naming, `a foreign key of "${logical}" has an unknown onDelete`);
  }
  return {
    fields: own,
    references: references as string,
    referencesPhysical: physical,
    referencedFields: referenced,
    onDelete: fk.onDelete,
  };
}

/** Structural form of a field for equality checks of two schemas. */
export const fieldSignature = (field: PluginStorageField | CompiledField): string =>
  JSON.stringify([
    field.type,
    field.nullable,
    field.hasDefault || (field as CompiledField).generated === true,
    field.default ?? null,
    field.length ?? null,
    field.precision ?? null,
    field.scale ?? null,
    (field as CompiledField).generated === true,
    (field as CompiledField).column ?? null,
  ]);

/** Structural form of a table: what two migration paths must agree on. Physical index names are included. */
export function tableSignature(table: CompiledTable): string {
  return JSON.stringify({
    physical: table.physical,
    fields: [...table.fields.values()].map((field) => [field.name, fieldSignature(field)]).sort(),
    primaryKey: table.primaryKey,
    indexes: table.indexes.map((index) => [index.name, index.fields, index.unique]).sort(),
    foreignKeys: table.foreignKeys
      .map((fk) => [fk.fields, fk.referencesPhysical, fk.referencedFields, fk.onDelete ?? null])
      .sort(),
  });
}
