/**
 * Plugin storage: the only way a plugin keeps data of its own (SDK 2.0).
 *
 * A plugin has no database access. It declares tables in a backend-neutral schema, ships neutral migrations for them
 * and reads and writes rows through the record port (`context.storage`). The host owns the engine, the DDL, the
 * transactions, the migration bookkeeping and the backups. Nothing here names an engine, a driver or SQL.
 *
 * - Declare with {@link definePluginStorage} and register it as `PluginBackendModule.storage`.
 * - Open the tables with `context.storage.open(definition)`; rows and filters are typed from the declaration.
 * - Group writes (also together with host ports such as `hostData`) with `context.persistence.transaction`, and pass
 *   the scope to every call. See docs/en/plugins/plugin-storage.md.
 */
import type { PluginTransactionScope } from './plugin-persistence';

/* ------------------------------------------------------------------------------------------------------------- *
 * Schema declaration
 * ------------------------------------------------------------------------------------------------------------- */

/** Neutral field types. Values are exact on every backend: decimals keep their precision, timestamps are UTC. */
export type PluginStorageFieldType =
  | 'string' // bounded text (default length 255)
  | 'text' // unbounded text
  | 'integer' // safe integer (JavaScript number)
  | 'decimal' // exact decimal, carried as a string such as "12.50"
  | 'boolean'
  | 'timestamp' // an instant, UTC, millisecond precision; carried as a Date
  | 'date' // a calendar day without time zone, carried as "YYYY-MM-DD"
  | 'json' // any JSON value
  | 'uuid'; // lowercase canonical UUID string

/** TypeScript value type of a neutral field type. */
export interface PluginStorageValueTypes {
  string: string;
  text: string;
  integer: number;
  decimal: string;
  boolean: boolean;
  timestamp: Date;
  date: string;
  json: unknown;
  uuid: string;
}

/** Default of a field: a literal of the field's value type, or `now` for a timestamp set when the row is created. */
export type PluginStorageDefault = string | number | boolean | null | { readonly now: true };

export interface PluginStorageField<
  T extends PluginStorageFieldType = PluginStorageFieldType,
  Nullable extends boolean = boolean,
  HasDefault extends boolean = boolean,
> {
  readonly type: T;
  readonly nullable: Nullable;
  /** Present for a field with a default or a generated value: the field is optional on insert. */
  readonly hasDefault: HasDefault;
  readonly default?: PluginStorageDefault;
  /** `string` only. */
  readonly length?: number;
  /** `decimal` only. */
  readonly precision?: number;
  readonly scale?: number;
  /** The host generates the value (auto-increment integer or random uuid). Primary keys only. */
  readonly generated?: boolean;
  /** Host-side column name when it differs from the field name (adoption of an existing table). */
  readonly column?: string;
}

export interface PluginStorageFieldOptions {
  length?: number;
  precision?: number;
  scale?: number;
  column?: string;
}

type FieldBuilder<T extends PluginStorageFieldType, N extends boolean, D extends boolean> = PluginStorageField<T, N, D> & {
  /** Allows null. */
  optional(): FieldBuilder<T, true, D>;
  /** Sets a default; the field becomes optional on insert. */
  withDefault(value: PluginStorageDefault): FieldBuilder<T, N, true>;
};

function builder<T extends PluginStorageFieldType, N extends boolean, D extends boolean>(
  field: PluginStorageField<T, N, D>,
): FieldBuilder<T, N, D> {
  return {
    ...field,
    optional: () => builder({ ...field, nullable: true, hasDefault: field.hasDefault } as PluginStorageField<T, true, D>),
    withDefault: (value) => builder({ ...field, default: value, hasDefault: true } as PluginStorageField<T, N, true>),
  };
}

function make<T extends PluginStorageFieldType>(type: T, options: PluginStorageFieldOptions = {}) {
  return builder<T, false, false>({ type, nullable: false, hasDefault: false, ...options });
}

/** Field constructors. `f.integer().optional()` is a nullable integer, `f.boolean().withDefault(false)` has a default. */
export const f = {
  string: (options?: PluginStorageFieldOptions) => make('string', options),
  text: (options?: PluginStorageFieldOptions) => make('text', options),
  integer: (options?: PluginStorageFieldOptions) => make('integer', options),
  decimal: (precision: number, scale: number, options?: PluginStorageFieldOptions) =>
    make('decimal', { ...options, precision, scale }),
  boolean: (options?: PluginStorageFieldOptions) => make('boolean', options),
  timestamp: (options?: PluginStorageFieldOptions) => make('timestamp', options),
  date: (options?: PluginStorageFieldOptions) => make('date', options),
  json: (options?: PluginStorageFieldOptions) => make('json', options),
  uuid: (options?: PluginStorageFieldOptions) => make('uuid', options),
  /** Generated integer primary key (auto-increment). */
  id: (options?: PluginStorageFieldOptions) =>
    builder<'integer', false, true>({ type: 'integer', nullable: false, hasDefault: true, generated: true, ...options }),
  /** Generated uuid primary key. */
  uuidId: (options?: PluginStorageFieldOptions) =>
    builder<'uuid', false, true>({ type: 'uuid', nullable: false, hasDefault: true, generated: true, ...options }),
} as const;

export interface PluginStorageForeignKey {
  readonly fields: readonly string[];
  /** A table of the same plugin (logical name). Core tables cannot be referenced. */
  readonly references: string;
  /**
   * Fields of the referenced table, paired with `fields` in order: its primary key or the fields of one of its unique
   * indexes, each of the same type as the field that points at it.
   */
  readonly referencedFields: readonly string[];
  readonly onDelete?: 'cascade' | 'restrict' | 'set-null';
}

export interface PluginStorageIndex {
  /**
   * Leave it out: the host names the index `idx_<table>_<fields>` (`uq_` when unique), and `step.dropIndex` takes
   * that name. Only an index of a 1.x table that version 1 adopts (see `physicalName`) keeps its own name, which must
   * start, after an optional `IDX_`/`UQ_`, with `plugin_<plugin>_` or `<plugin>_`.
   */
  readonly name?: string;
  readonly fields: readonly string[];
  readonly unique?: boolean;
}

export interface PluginStorageTable<Fields extends Record<string, PluginStorageField> = Record<string, PluginStorageField>> {
  readonly fields: Fields;
  /** Primary key field names. Defaults to the single generated field. */
  readonly primaryKey: readonly string[];
  readonly indexes: readonly PluginStorageIndex[];
  readonly foreignKeys: readonly PluginStorageForeignKey[];
  /**
   * Host-side table name when it differs from the derived `plugin_<plugin>_<logical>` name, to adopt a table a 1.x
   * release created. Allowed only on the tables version 1 of a definition with `adoption` creates; it must start with
   * `plugin_<plugin>_` or `<plugin>_` and stay out of every other installed plugin's namespace. An adopted table may
   * not declare `decimal` fields (1.x stored decimals as REAL or text).
   */
  readonly physicalName?: string;
}

export interface PluginStorageTableOptions {
  primaryKey?: readonly string[];
  indexes?: readonly PluginStorageIndex[];
  foreignKeys?: readonly PluginStorageForeignKey[];
  physicalName?: string;
}

/** Declares one table. The primary key defaults to the generated field. */
export function table<Fields extends Record<string, PluginStorageField>>(
  fields: Fields,
  options: PluginStorageTableOptions = {},
): PluginStorageTable<Fields> {
  const generated = Object.entries(fields)
    .filter(([, field]) => field.generated)
    .map(([name]) => name);
  return {
    fields,
    primaryKey: options.primaryKey ?? generated,
    indexes: options.indexes ?? [],
    foreignKeys: options.foreignKeys ?? [],
    physicalName: options.physicalName,
  };
}

export type PluginStorageTables = Record<string, PluginStorageTable>;

/* ------------------------------------------------------------------------------------------------------------- *
 * Neutral migrations
 * ------------------------------------------------------------------------------------------------------------- */

/** Declarative step. The host turns each into DDL for the active backend and runs it in the migration transaction. */
export type PluginStorageMigrationStep =
  | { readonly op: 'createTable'; readonly table: string; readonly definition: PluginStorageTable }
  | { readonly op: 'dropTable'; readonly table: string }
  | { readonly op: 'addColumn'; readonly table: string; readonly field: string; readonly definition: PluginStorageField }
  | { readonly op: 'dropColumn'; readonly table: string; readonly field: string }
  | { readonly op: 'renameColumn'; readonly table: string; readonly from: string; readonly to: string }
  | { readonly op: 'addIndex'; readonly table: string; readonly index: PluginStorageIndex }
  | { readonly op: 'dropIndex'; readonly table: string; readonly name: string };

/** What a data step may use: the record port of the plugin's own tables, in the migration's transaction. */
export interface PluginStorageDataStepContext<Tables extends PluginStorageTables = PluginStorageTables> {
  readonly tables: PluginStorageTablesApi<Tables>;
}

export interface PluginStorageMigration {
  /** Strictly increasing, starting at 1. Version 1 is the baseline: it must describe the current table layout. */
  readonly version: number;
  readonly name: string;
  /** Declarative steps, applied in order. */
  readonly steps?: readonly PluginStorageMigrationStep[];
  /** Optional data step run after `steps`, with the record port only. */
  readonly data?: (context: PluginStorageDataStepContext) => Promise<void>;
}

/** Step constructors. */
export const step = {
  createTable: (name: string, definition: PluginStorageTable): PluginStorageMigrationStep => ({
    op: 'createTable',
    table: name,
    definition,
  }),
  dropTable: (name: string): PluginStorageMigrationStep => ({ op: 'dropTable', table: name }),
  addColumn: (tableName: string, field: string, definition: PluginStorageField): PluginStorageMigrationStep => ({
    op: 'addColumn',
    table: tableName,
    field,
    definition,
  }),
  dropColumn: (tableName: string, field: string): PluginStorageMigrationStep => ({
    op: 'dropColumn',
    table: tableName,
    field,
  }),
  renameColumn: (tableName: string, from: string, to: string): PluginStorageMigrationStep => ({
    op: 'renameColumn',
    table: tableName,
    from,
    to,
  }),
  addIndex: (tableName: string, index: PluginStorageIndex): PluginStorageMigrationStep => ({
    op: 'addIndex',
    table: tableName,
    index,
  }),
  dropIndex: (tableName: string, name: string): PluginStorageMigrationStep => ({ op: 'dropIndex', table: tableName, name }),
} as const;

/**
 * Adoption of existing installations. A plugin that stored data with TypeORM migrations in 1.x lists the names of
 * its last legacy migration(s); a database where every one of them is applied is recorded at baseline version 1
 * without running anything (the tables stay in place). A database with only some of them applied is refused.
 */
export interface PluginStorageLegacyAdoption {
  /** Class names (with timestamp suffix) of every migration the 1.x plugin shipped, in order. */
  readonly legacyMigrations: readonly string[];
}

export interface PluginStorageDefinition<Tables extends PluginStorageTables = PluginStorageTables> {
  /** Head shape of the plugin's tables: what the migrations produce after the last version. Types are derived from it. */
  readonly tables: Tables;
  readonly migrations: readonly PluginStorageMigration[];
  readonly adoption?: PluginStorageLegacyAdoption;
}

export function definePluginStorage<Tables extends PluginStorageTables>(
  definition: PluginStorageDefinition<Tables>,
): PluginStorageDefinition<Tables> {
  return definition;
}

/* ------------------------------------------------------------------------------------------------------------- *
 * Rows and filters
 * ------------------------------------------------------------------------------------------------------------- */

type ValueOf<F extends PluginStorageField> = F['nullable'] extends true
  ? PluginStorageValueTypes[F['type']] | null
  : PluginStorageValueTypes[F['type']];

/** Row as read. */
export type PluginStorageRow<T extends PluginStorageTable> = { [K in keyof T['fields']]: ValueOf<T['fields'][K]> };

type OptionalOnInsert<T extends PluginStorageTable> = {
  [K in keyof T['fields'] as T['fields'][K]['hasDefault'] extends true
    ? K
    : T['fields'][K]['nullable'] extends true
      ? K
      : never]?: ValueOf<T['fields'][K]>;
};
type RequiredOnInsert<T extends PluginStorageTable> = {
  [K in keyof T['fields'] as T['fields'][K]['hasDefault'] extends true
    ? never
    : T['fields'][K]['nullable'] extends true
      ? never
      : K]: ValueOf<T['fields'][K]>;
};
/** Row as written: generated, defaulted and nullable fields are optional. */
export type PluginStorageInsert<T extends PluginStorageTable> = RequiredOnInsert<T> & OptionalOnInsert<T>;

/**
 * Operators on one field. Several operators in one object are combined with AND; an empty object is refused.
 *
 * Operands are checked for their type and form only (a string, a safe integer, a decimal string, a valid Date, a
 * `YYYY-MM-DD` day, a boolean), never against the column's limits: a string longer than the field, a decimal with
 * more fraction digits than the scale or a malformed UUID is a valid operand that compares exactly (an `eq` then
 * matches nothing). `null` is only an operand of `eq`/`ne` (same as `isNull`); inside `in`/`notIn` and for the other
 * operators it is refused: combine with `isNull` through `or` instead.
 *
 * SQL three-valued logic applies: a row whose field is NULL never matches `ne`, `notIn`, `lt`... or a `not` around
 * them. `in: []` matches nothing; `notIn: []` matches every row with a value. Booleans support eq, ne, in, notIn and
 * isNull, not the ordering operators; JSON fields only `isNull` (and `eq: null`). `startsWith` compares
 * case-sensitively, by characters.
 */
export interface PluginStorageOperators<V> {
  eq?: V | null;
  ne?: V | null;
  in?: readonly V[];
  notIn?: readonly V[];
  lt?: V;
  lte?: V;
  gt?: V;
  gte?: V;
  between?: readonly [V, V];
  isNull?: boolean;
  /** `string`/`text` only: matches values starting with the prefix (case-sensitive). */
  startsWith?: V extends string ? string : never;
}

type FieldFilter<V> = V | null | PluginStorageOperators<NonNullable<V>>;

/**
 * Structured filter. Several keys in one object (fields, `and`, `or`, `not`) are combined with AND. `and: []` is
 * true, `or: []` is false. An undefined value and a `null` filter (also inside `and`/`or`/`not`) are refused instead
 * of matching everything. Lists bind one value each: a call may bind at most a backend limit of values (PostgreSQL 65535).
 */
export type PluginStorageWhere<Row> =
  | { [K in keyof Row]?: FieldFilter<Row[K]> }
  | { and: ReadonlyArray<PluginStorageWhere<Row>> }
  | { or: ReadonlyArray<PluginStorageWhere<Row>> }
  | { not: PluginStorageWhere<Row> };

export interface PluginStorageOrder<Row> {
  readonly field: keyof Row & string;
  readonly direction?: 'asc' | 'desc';
}

export interface PluginStorageQuery<Row> {
  where?: PluginStorageWhere<Row>;
  /**
   * Sort order; NULL sorts lowest (first ascending, last descending). The primary key ascending always breaks ties,
   * also without `orderBy`, so pages of a list are stable. Booleans and JSON cannot be ordered.
   */
  orderBy?: ReadonlyArray<PluginStorageOrder<Row>>;
  limit?: number;
  offset?: number;
}

/** Value of an update that adds to the stored number atomically: `{ attempts: increment(1) }`. NULL counts as 0. */
export interface PluginStorageIncrement {
  readonly increment: number;
}
export const increment = (by: number): PluginStorageIncrement => ({ increment: by });

/** Patch of an update. Integer fields also accept {@link increment}. */
export type PluginStoragePatch<Row> = {
  [K in keyof Row]?: Row[K] | (Row[K] extends number | null ? PluginStorageIncrement : never);
};

/**
 * Optional last argument of every call. Pass the scope of `context.persistence.transaction` to join it.
 *
 * Without a scope, a read runs at once and sees committed rows (inside a transaction callback, pass the scope to
 * see the transaction's own writes), and a write is a transaction of its own that waits for running ones. A write
 * without scope inside a transaction callback, or inside a hook the host calls in its own transaction, is refused
 * with PluginStorageInvalid: it would wait for that transaction. A closed scope, or one the host did not hand out,
 * is refused too. The scope a hook receives for the host's transaction is read-only.
 */
export interface PluginStorageCallOptions {
  readonly scope?: PluginTransactionScope;
}

/* ------------------------------------------------------------------------------------------------------------- *
 * Record port
 * ------------------------------------------------------------------------------------------------------------- */

export interface PluginStorageTableApi<T extends PluginStorageTable> {
  /** Inserts one row and returns it with generated keys and defaults. Throws {@link PluginStorageUniqueViolation}. */
  insert(row: PluginStorageInsert<T>, options?: PluginStorageCallOptions): Promise<PluginStorageRow<T>>;
  /**
   * Inserts the rows in order and returns them like {@link insert}. All or nothing: one transaction, with one
   * statement per row (not one bulk statement), so keep very large imports in batches.
   */
  insertMany(rows: readonly PluginStorageInsert<T>[], options?: PluginStorageCallOptions): Promise<PluginStorageRow<T>[]>;
  /** Row by primary key (a single value for one-field keys, an object for composite keys), or null. */
  get(key: PluginStorageKey<T>, options?: PluginStorageCallOptions): Promise<PluginStorageRow<T> | null>;
  find(query?: PluginStorageQuery<PluginStorageRow<T>>, options?: PluginStorageCallOptions): Promise<PluginStorageRow<T>[]>;
  findOne(
    query?: PluginStorageQuery<PluginStorageRow<T>>,
    options?: PluginStorageCallOptions,
  ): Promise<PluginStorageRow<T> | null>;
  count(where?: PluginStorageWhere<PluginStorageRow<T>>, options?: PluginStorageCallOptions): Promise<number>;
  /**
   * Updates every row matching `where` and returns how many changed. The condition is evaluated atomically with the
   * write, so `update({ id, status: 'pending' }, { status: 'confirmed' })` is a compare-and-set: it returns 0 when
   * another writer got there first. Use it for leases, claims and state machines. `where` undefined or `{}`
   * updates EVERY row of the table; `null` is refused.
   */
  update(
    where: PluginStorageWhere<PluginStorageRow<T>>,
    patch: PluginStoragePatch<PluginStorageRow<T>>,
    options?: PluginStorageCallOptions,
  ): Promise<number>;
  /** Deletes the matching rows and returns how many were removed. `where` undefined or `{}` deletes EVERY row. */
  delete(where: PluginStorageWhere<PluginStorageRow<T>>, options?: PluginStorageCallOptions): Promise<number>;
  /**
   * Inserts the row, or updates the existing one with the same values of `conflictOn` (a declared unique key or
   * the primary key). The row must give a non-null value for every field of `conflictOn`. `update` lists the fields
   * to overwrite (not key or generated fields); the default is every field except the key and generated fields, so
   * fields the row omits take their defaults.
   */
  upsert(
    row: PluginStorageInsert<T>,
    options: PluginStorageCallOptions & { conflictOn: readonly (keyof PluginStorageRow<T> & string)[]; update?: readonly (keyof PluginStorageRow<T> & string)[] },
  ): Promise<PluginStorageRow<T>>;
  /** Minimum, maximum and sum of a numeric/timestamp field over the matching rows (null when none match). */
  aggregate(
    field: keyof PluginStorageRow<T> & string,
    where?: PluginStorageWhere<PluginStorageRow<T>>,
    options?: PluginStorageCallOptions,
  ): Promise<{ min: unknown; max: unknown; sum: number | string | null; count: number }>;
}

export type PluginStorageKey<T extends PluginStorageTable> = number | string | Partial<PluginStorageRow<T>>;

export type PluginStorageTablesApi<Tables extends PluginStorageTables> = {
  readonly [K in keyof Tables]: PluginStorageTableApi<Tables[K]>;
};

/** `context.storage`. Requires the PLUGIN_STORAGE permission. */
export interface PluginStorageContext {
  /**
   * Opens the tables of the plugin's own storage definition. The definition must be the one the plugin registered as
   * `PluginBackendModule.storage`; the host serves only those tables, in the plugin's own namespace.
   */
  open<Tables extends PluginStorageTables>(definition: PluginStorageDefinition<Tables>): PluginStorageTablesApi<Tables>;
}

/* ------------------------------------------------------------------------------------------------------------- *
 * Errors
 * ------------------------------------------------------------------------------------------------------------- */

/** Neutral storage errors. They are the same on every backend. */
export class PluginStorageError extends Error {
  constructor(
    message: string,
    readonly code: 'UNIQUE_VIOLATION' | 'CONFLICT' | 'NOT_FOUND' | 'INVALID' | 'REFUSED',
  ) {
    super(message);
    this.name = 'PluginStorageError';
  }
}

/** A unique key or the primary key was already taken. */
export class PluginStorageUniqueViolation extends PluginStorageError {
  constructor(message = 'A row with the same unique key already exists.') {
    super(message, 'UNIQUE_VIOLATION');
    this.name = 'PluginStorageUniqueViolation';
  }
}

/**
 * The operation lost a race or hit a busy database, and was rolled back. The host does not retry; retrying the whole
 * call or transaction is safe when its external effects run in `afterCommit`.
 */
export class PluginStorageConflict extends PluginStorageError {
  constructor(message = 'The storage is busy; retry the operation.') {
    super(message, 'CONFLICT');
    this.name = 'PluginStorageConflict';
  }
}

/** A required row does not exist. */
export class PluginStorageNotFound extends PluginStorageError {
  constructor(message = 'The row does not exist.') {
    super(message, 'NOT_FOUND');
    this.name = 'PluginStorageNotFound';
  }
}

/** An undeclared table or field, an invalid value or an unsupported filter. */
export class PluginStorageInvalid extends PluginStorageError {
  constructor(message: string) {
    super(message, 'INVALID');
    this.name = 'PluginStorageInvalid';
  }
}
