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
import { foreignNamespaceOf, indexNameBody, namespaceMatch } from './storage-namespace';
import { MAX_DECIMAL_PRECISION, normalizeValue } from './storage-values';

/** Resolution of names for one plugin: the namespace rules every physical identifier must obey. */
export interface StorageNaming {
  readonly pluginName: string;
  readonly namespace: string;
  /** Tables and indexes that exist outside the plugin (core tables); a plugin may not claim them. */
  readonly reservedTables: ReadonlySet<string>;
  /**
   * Namespaces of the other installed plugins with storage. A namespace is a plain name prefix, so the namespace of
   * `qaiso` is a prefix of the one of `qaiso-extra`: no name may lie in another plugin's namespace (see
   * storage-namespace).
   */
  readonly siblingNamespaces?: ReadonlySet<string>;
  /**
   * Whether explicit physical table and index names are allowed here: only the tables version 1 of a definition with
   * `adoption` creates (the 1.x tables adopted in place) keep their own names. Everything else is derived.
   */
  readonly adoptable?: boolean;
  /**
   * The 1.x namespace (the plugin.json name of the 1.x release) the adopted names keep, when it differs from
   * `namespace`: the npm package `@attraccess/plugin-shelly` adopts the `plugin_shelly_*` tables of the 1.x `shelly`.
   * Only meaningful together with `adoptable`.
   */
  readonly legacyNamespace?: string;
}

/** The length of the longest own prefix (current or 1.x namespace) `name` starts with; 0 when none does. */
function ownMatch(naming: StorageNaming, name: string): number {
  const legacy = naming.adoptable && naming.legacyNamespace ? namespaceMatch(name, naming.legacyNamespace) : 0;
  return Math.max(namespaceMatch(name, naming.namespace), legacy);
}

const allowedPrefixes = (naming: StorageNaming): string =>
  [naming.namespace, ...(naming.adoptable && naming.legacyNamespace ? [naming.legacyNamespace] : [])]
    .flatMap((ns) => [`plugin_${ns}_`, `${ns}_`])
    .map((prefix) => `"${prefix}"`)
    .join(' or ');

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

/** The physical table name: the adopted name when declared (and allowed), otherwise the derived one. */
export function physicalTableName(naming: StorageNaming, logical: string, explicit: unknown): string {
  if (!IDENTIFIER.test(logical)) fail(naming, `table name "${logical}" must match ${IDENTIFIER.source}`);
  const derived = derivedTableName(naming, logical);
  const name = explicit === undefined ? derived : explicit;
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
    return fail(naming, `physicalName of table "${logical}" must match ${IDENTIFIER.source}`);
  }
  if (name !== derived) checkExplicitTableName(naming, logical, name);
  checkForeignNamespace(naming, `table name "${name}"`, name);
  const lowered = name.toLowerCase();
  if (RESERVED_TABLE_PREFIXES.some((prefix) => lowered.startsWith(prefix))) {
    fail(naming, `table name "${name}" uses a prefix the host reserves`);
  }
  if (naming.reservedTables.has(lowered) || naming.reservedTables.has(name)) {
    fail(naming, `table name "${name}" belongs to the host`);
  }
  return name;
}

function checkExplicitTableName(naming: StorageNaming, logical: string, name: string): void {
  if (!naming.adoptable) {
    fail(
      naming,
      `physicalName "${name}" of table "${logical}" is only allowed on the 1.x tables version 1 adopts (a definition ` +
        `with adoption); other tables are always named "${derivedTableName(naming, logical)}"`,
    );
  }
  if (ownMatch(naming, name) === 0) {
    fail(naming, `physicalName "${name}" must start with ${allowedPrefixes(naming)}`);
  }
}

/** Refuses a name that lies in the storage namespace of another installed plugin. */
function checkForeignNamespace(naming: StorageNaming, label: string, name: string): void {
  const claimedBy = foreignNamespaceOf(
    name,
    naming.namespace,
    naming.siblingNamespaces ?? [],
    naming.adoptable ? naming.legacyNamespace : undefined,
  );
  if (claimedBy !== undefined) {
    fail(naming, `${label} lies in the storage namespace "${claimedBy}" of another installed plugin`);
  }
}

function indexName(
  naming: StorageNaming,
  table: string,
  fields: readonly string[],
  unique: boolean,
  given: unknown,
): string {
  if (given !== undefined) return checkedIndexName(naming, given);
  const generated = shortened(`${unique ? 'uq' : 'idx'}_${table}_${fields.join('_')}`);
  checkForeignNamespace(naming, `index name "${generated}"`, indexNameBody(generated));
  return generated;
}

/** An identifier cut to the maximum length, kept unique by a digest of the full form. */
function shortened(full: string): string {
  if (full.length <= MAX_IDENTIFIER_LENGTH) return full;
  const digest = createHash('sha1').update(full).digest('hex').slice(0, 10);
  return `${full.slice(0, MAX_IDENTIFIER_LENGTH - 11)}_${digest}`;
}

function checkedIndexName(naming: StorageNaming, given: unknown): string {
  if (!naming.adoptable) {
    fail(
      naming,
      `index name "${String(given)}" is only allowed on the 1.x tables version 1 adopts (a definition with adoption); ` +
        'leave it out and the host names the index idx_<table>_<fields> (uq_ when unique)',
    );
  }
  const body = typeof given === 'string' ? indexNameBody(given) : '';
  if (typeof given !== 'string' || !IDENTIFIER.test(given) || ownMatch(naming, body) === 0) {
    fail(
      naming,
      `index name "${String(given)}" must match ${IDENTIFIER.source} and, after an optional IDX_/UQ_ marker, start ` +
        `with ${allowedPrefixes(naming)}`,
    );
  }
  checkForeignNamespace(naming, `index name "${given}"`, body);
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

/** Resolves a logical table of the same plugin, as a foreign key sees it. */
export type TableResolver = (logical: string) => CompiledTable | undefined;

/**
 * Compiles a table. Foreign keys are resolved against `tableOf` (the table itself for a self reference), so their
 * referenced fields are checked against the referenced table's keys and stored as its physical columns.
 */
export function compileTable(
  naming: StorageNaming,
  logical: string,
  decl: unknown,
  physical: string,
  tableOf: TableResolver,
): CompiledTable {
  const base = compileTableBase(naming, logical, decl, physical);
  return withForeignKeys(naming, base, decl, (name) => (name === logical ? base : tableOf(name)));
}

/** A table without its foreign keys: fields, primary key and indexes. */
export function compileTableBase(
  naming: StorageNaming,
  logical: string,
  decl: unknown,
  physical: string,
): CompiledTable {
  if (!isRecord(decl) || !isRecord(decl.fields)) return fail(naming, `table "${logical}" must be built with table()`);
  const fields = compileFields(naming, logical, decl.fields);
  const primaryKey = readStringList(naming, `primaryKey of "${logical}"`, decl.primaryKey);
  checkPrimaryKey(naming, logical, fields, primaryKey);
  const indexes = compileIndexes(naming, logical, physical, fields, decl.indexes as PluginStorageIndex[] | undefined);
  return { logical, physical, fields, primaryKey, indexes, foreignKeys: [] };
}

/** Adds the declared foreign keys of `decl` to its compiled base table. */
export function withForeignKeys(
  naming: StorageNaming,
  base: CompiledTable,
  decl: unknown,
  tableOf: TableResolver,
): CompiledTable {
  const declared = ((decl as { foreignKeys?: PluginStorageTable['foreignKeys'] }).foreignKeys ?? []).map((fk) =>
    compileForeignKey(naming, base, fk, tableOf),
  );
  return { ...base, foreignKeys: declared };
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
  table: CompiledTable,
  fk: PluginStorageTable['foreignKeys'][number],
  tableOf: TableResolver,
): CompiledForeignKey {
  const where = `a foreign key of "${table.logical}"`;
  if (!isRecord(fk)) return fail(naming, `${where} is malformed`);
  const own = readStringList(naming, where, fk.fields);
  const referenced = readStringList(naming, where, fk.referencedFields);
  for (const name of own) if (!table.fields.has(name)) fail(naming, `${where} names the unknown field "${name}"`);
  if (own.length !== referenced.length) fail(naming, `${where} pairs unequal field lists`);
  const references = fk.references;
  const target = typeof references === 'string' ? tableOf(references) : undefined;
  if (!target) {
    return fail(naming, `${where} references "${String(references)}", which is not a table of this plugin`);
  }
  if (fk.onDelete !== undefined && !ON_DELETE_ACTIONS.includes(fk.onDelete))
    fail(naming, `${where} has an unknown onDelete`);
  const referencedColumns = referencedColumnsOf(naming, where, table, own, target, referenced);
  return {
    fields: own,
    references: target.logical,
    referencesPhysical: target.physical,
    referencedFields: referenced,
    referencedColumns,
    onDelete: fk.onDelete,
  };
}

/**
 * The physical columns a foreign key references. They must be the primary key or a unique index of the referenced
 * table (what every engine requires of a parent key), and each must have the type of the field that points at it.
 */
function referencedColumnsOf(
  naming: StorageNaming,
  where: string,
  table: CompiledTable,
  own: readonly string[],
  target: CompiledTable,
  referenced: readonly string[],
): string[] {
  const columns = referenced.map((name, position) => {
    const parent = target.fields.get(name);
    if (!parent) return fail(naming, `${where} references the unknown field "${target.logical}.${name}"`);
    const child = table.fields.get(own[position]) as CompiledField;
    if (child.type !== parent.type) {
      fail(naming, `${where}: "${child.name}" (${child.type}) cannot reference "${name}" (${parent.type})`);
    }
    return parent.column;
  });
  if (!isKeyOf(target, referenced)) {
    fail(naming, `${where} must reference the primary key or a unique index of "${target.logical}"`);
  }
  return columns;
}

/** Whether `fields` (in any order) are exactly the primary key or the fields of a unique index of `table`. */
export function isKeyOf(table: CompiledTable, fields: readonly string[]): boolean {
  const wanted = new Set(fields);
  const same = (key: readonly string[]) =>
    wanted.size === fields.length && key.length === wanted.size && key.every((name) => wanted.has(name));
  return same(table.primaryKey) || table.indexes.some((index) => index.unique && same(index.fields));
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
      .map((fk) => [fk.fields, fk.referencesPhysical, fk.referencedFields, fk.referencedColumns, fk.onDelete ?? null])
      .sort(),
  });
}
