import { randomUUID } from 'crypto';
import {
  PluginStorageInvalid,
  type PluginStorageCallOptions,
  type PluginStorageTableApi,
  type PluginStorageTable,
  type PluginStorageTablesApi,
  type PluginStorageTables,
} from '@attraccess/plugins-backend-sdk';
import type { PluginStorageDialect, PluginStorageExecutor, PluginStorageSessions } from './storage-dialect.port';
import type { CompiledField, CompiledSchema, CompiledTable } from './storage-model';
import { mapStorageError } from './storage-errors';
import { compileQuery, compileWhere, fieldOf, StorageParams } from './storage-query';
import { defaultInputOf } from './storage-compile';
import { normalizeValue } from './storage-values';

type Row = Record<string, unknown>;
type AnyTableApi = PluginStorageTableApi<PluginStorageTable>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** Everything the record port of one table needs: the table, the dialect and how to reach an executor. */
interface TableContext {
  readonly table: CompiledTable;
  readonly dialect: PluginStorageDialect;
  readonly sessions: PluginStorageSessions;
}

const selectList = ({ table, dialect }: TableContext): string =>
  [...table.fields.values()]
    .map((field) => `${dialect.quote(field.column)} AS ${dialect.quote(field.name)}`)
    .join(', ');

function decodeRow({ table, dialect }: TableContext, raw: Row): Row {
  const row: Row = {};
  for (const field of table.fields.values()) row[field.name] = dialect.decode(field, raw[field.name]);
  return row;
}

/** The value of a field a plugin did not provide: its default, or null, or undefined when none applies. */
function omittedValue(field: CompiledField): { value: unknown } | undefined {
  const fallback = field.default;
  if (fallback === undefined) return field.nullable ? { value: null } : undefined;
  if (fallback === null) return { value: null };
  if (typeof fallback === 'object') return { value: new Date() };
  return { value: normalizeValue(field, defaultInputOf(field, fallback)) };
}

interface InsertValues {
  /** Canonical value per field, in declaration order; generated integer keys the engine assigns are absent. */
  readonly values: Map<string, unknown>;
  readonly provided: ReadonlySet<string>;
}

function buildInsert(table: CompiledTable, input: unknown): InsertValues {
  if (!isPlainObject(input)) throw new PluginStorageInvalid(`A row of "${table.logical}" is an object.`);
  for (const key of Object.keys(input)) fieldOf(table, key, 'a row');
  const values = new Map<string, unknown>();
  const provided = new Set<string>();
  for (const field of table.fields.values()) {
    const given = input[field.name];
    if (given !== undefined) {
      values.set(field.name, normalizeValue(field, given, `${table.logical}.${field.name}`));
      provided.add(field.name);
    } else if (field.generated) {
      if (field.type === 'uuid') values.set(field.name, randomUUID());
    } else {
      const fallback = omittedValue(field);
      if (!fallback) throw new PluginStorageInvalid(`Missing required field "${table.logical}.${field.name}".`);
      values.set(field.name, fallback.value);
    }
  }
  return { values, provided };
}

function insertStatement(
  context: TableContext,
  values: ReadonlyMap<string, unknown>,
  tail = '',
): { sql: string; params: unknown[] } {
  const { table, dialect } = context;
  const params = new StorageParams(dialect);
  const names = [...values.keys()];
  const head = `INSERT INTO ${dialect.quote(table.physical)}`;
  if (names.length === 0) return { sql: `${head} DEFAULT VALUES${tail}`, params: [] };
  const columns = names.map((name) => dialect.quote(fieldOf(table, name, 'a row').column));
  const markers = names.map((name) => {
    const field = fieldOf(table, name, 'a row');
    return params.add(dialect.encode(field, values.get(name)));
  });
  return { sql: `${head} (${columns.join(', ')}) VALUES (${markers.join(', ')})${tail}`, params: params.values };
}

/** The row an insert produced, built from what was written (plus the key the engine generated). */
function writtenRow(context: TableContext, values: ReadonlyMap<string, unknown>, generated: unknown): Row {
  const row: Row = {};
  for (const field of context.table.fields.values()) {
    const value = values.has(field.name) ? values.get(field.name) : field.generated ? generated : null;
    row[field.name] = normalizeValue(field, value ?? null);
  }
  return row;
}

/** The generated key field the engine fills for this insert (an integer key the row does not give), if any. */
const engineGeneratedKey = (table: CompiledTable, values: ReadonlyMap<string, unknown>): CompiledField | undefined =>
  [...table.fields.values()].find((field) => field.generated && !values.has(field.name));

async function insertRow(context: TableContext, executor: PluginStorageExecutor, input: unknown): Promise<Row> {
  const { values } = buildInsert(context.table, input);
  const key = engineGeneratedKey(context.table, values);
  const statement = insertStatement(
    context,
    values,
    key ? context.dialect.returning(context.dialect.quote(key.column)) : '',
  );
  const generated = await executor.insert(statement.sql, statement.params, key?.column);
  return writtenRow(context, values, key ? context.dialect.decode(key, generated) : undefined);
}

/** The where clause that selects one row by its primary key given as a value (one-field key) or an object. */
function keyFilter(table: CompiledTable, key: unknown): Row {
  if (table.primaryKey.length === 1 && !isPlainObject(key)) return { [table.primaryKey[0]]: key };
  if (!isPlainObject(key))
    throw new PluginStorageInvalid(`The key of "${table.logical}" is an object of its key fields.`);
  const filter: Row = {};
  for (const name of table.primaryKey) {
    if (key[name] === undefined || key[name] === null) {
      throw new PluginStorageInvalid(`The key of "${table.logical}" needs the field "${name}".`);
    }
    filter[name] = key[name];
  }
  return filter;
}

async function findRows(context: TableContext, executor: PluginStorageExecutor, query: unknown): Promise<Row[]> {
  const params = new StorageParams(context.dialect);
  const parts = compileQuery(context.table, context.dialect, params, (query ?? {}) as never);
  const sql = [
    `SELECT ${selectList(context)} FROM ${context.dialect.quote(context.table.physical)}`,
    `WHERE ${parts.where}`,
    parts.orderBy,
    parts.limit,
  ]
    .filter(Boolean)
    .join(' ');
  return (await executor.query(sql, params.values)).map((raw) => decodeRow(context, raw));
}

function checkConflictTarget(table: CompiledTable, conflictOn: unknown): string[] {
  if (!Array.isArray(conflictOn) || conflictOn.length === 0) {
    throw new PluginStorageInvalid('upsert needs conflictOn: the fields of a unique key.');
  }
  const names = conflictOn.map((name) => fieldOf(table, name, 'conflictOn').name);
  const same = (candidate: readonly string[]) =>
    candidate.length === names.length && candidate.every((name) => names.includes(name));
  if (!same(table.primaryKey) && !table.indexes.some((index) => index.unique && same(index.fields))) {
    throw new PluginStorageInvalid(`conflictOn must be the primary key or a unique index of "${table.logical}".`);
  }
  return names;
}

/** The fields an upsert overwrites on conflict: `update` when given, otherwise every plain field outside the key. */
function overwriteFields(table: CompiledTable, target: readonly string[], update: unknown): string[] {
  if (update !== undefined && !Array.isArray(update)) throw new PluginStorageInvalid('update is a list of fields.');
  const overwrite =
    update === undefined
      ? [...table.fields.values()]
          .filter((field) => !field.generated && !target.includes(field.name))
          .map((field) => field.name)
      : (update as unknown[]).map((name) => fieldOf(table, name, 'update').name);
  if (overwrite.some((name) => target.includes(name) || table.fields.get(name)?.generated)) {
    throw new PluginStorageInvalid('update may not list a field of conflictOn or a generated field.');
  }
  return overwrite;
}

function conflictClause(
  { table, dialect }: TableContext,
  target: readonly string[],
  overwrite: readonly string[],
): string {
  const targetColumns = target.map((name) => dialect.quote(fieldOf(table, name, 'conflictOn').column)).join(', ');
  const assignments = overwrite.map((name) => {
    const column = dialect.quote(fieldOf(table, name, 'update').column);
    return `${column} = excluded.${column}`;
  });
  const action = overwrite.length === 0 ? 'DO NOTHING' : `DO UPDATE SET ${assignments.join(', ')}`;
  return ` ON CONFLICT (${targetColumns}) ${action}`;
}

async function upsertRow(
  context: TableContext,
  executor: PluginStorageExecutor,
  input: unknown,
  options: { conflictOn?: unknown; update?: unknown } | undefined,
): Promise<Row> {
  const { table } = context;
  const target = checkConflictTarget(table, options?.conflictOn);
  const { values, provided } = buildInsert(table, input);
  for (const name of target) {
    if (!provided.has(name) || values.get(name) === null) {
      throw new PluginStorageInvalid(`upsert needs a value for the key field "${table.logical}.${name}".`);
    }
  }
  const overwrite = overwriteFields(table, target, options?.update);
  const statement = insertStatement(context, values, conflictClause(context, target, overwrite));
  await executor.execute(statement.sql, statement.params);
  const where: Row = Object.fromEntries(target.map((name) => [name, values.get(name)]));
  const [row] = await findRows(context, executor, { where, limit: 1 });
  if (!row) throw new PluginStorageInvalid('The upserted row is not readable.');
  return row;
}

/** One `column = value` assignment of a patch: an `{ increment }` step on an integer, or a replacement value. */
function patchAssignment(
  { table, dialect }: TableContext,
  params: StorageParams,
  name: string,
  value: unknown,
): string {
  const field = fieldOf(table, name, 'a patch');
  if (field.generated) throw new PluginStorageInvalid(`The generated field "${name}" cannot be changed.`);
  const column = dialect.quote(field.column);
  if (!(isPlainObject(value) && 'increment' in value)) {
    return `${column} = ${params.add(dialect.encode(field, normalizeValue(field, value, `${table.logical}.${name}`)))}`;
  }
  const by = value.increment;
  if (field.type !== 'integer' || typeof by !== 'number' || !Number.isSafeInteger(by)) {
    throw new PluginStorageInvalid(`increment applies to integer fields with an integer step ("${name}").`);
  }
  return `${column} = COALESCE(${column}, 0) + ${params.add(by)}`;
}

function patchAssignments(context: TableContext, params: StorageParams, patch: unknown): string {
  if (!isPlainObject(patch)) throw new PluginStorageInvalid('A patch is an object of field values.');
  const assignments = Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => patchAssignment(context, params, name, value));
  if (assignments.length === 0) throw new PluginStorageInvalid('A patch needs at least one field.');
  return assignments.join(', ');
}

const AGGREGATE_TYPES = new Set(['integer', 'decimal', 'timestamp', 'date']);

async function aggregateRows(context: TableContext, executor: PluginStorageExecutor, name: unknown, where: unknown) {
  const { table, dialect } = context;
  const field = fieldOf(table, name, 'aggregate');
  if (!AGGREGATE_TYPES.has(field.type)) {
    throw new PluginStorageInvalid(
      `aggregate applies to integer, decimal, timestamp and date fields ("${field.name}").`,
    );
  }
  const params = new StorageParams(dialect);
  const column = dialect.quote(field.column);
  const summable = field.type === 'integer' || field.type === 'decimal';
  const condition = compileWhere(table, dialect, params, where);
  const sql =
    `SELECT MIN(${column}) AS "min", MAX(${column}) AS "max", ${summable ? `SUM(${column})` : 'NULL'} AS "sum", ` +
    `COUNT(*) AS "count" FROM ${dialect.quote(table.physical)} WHERE ${condition}`;
  const [raw] = await executor.query(sql, params.values);
  const decoded = (value: unknown) => dialect.decode(field, value ?? null);
  return {
    min: decoded(raw?.min),
    max: decoded(raw?.max),
    sum: summable ? (decoded(raw?.sum) as number | string | null) : null,
    count: Number(raw?.count ?? 0),
  };
}

function createTableApi(context: TableContext): AnyTableApi {
  const { sessions, table, dialect } = context;
  const run = async <T>(
    access: 'read' | 'write',
    options: PluginStorageCallOptions | undefined,
    work: (executor: PluginStorageExecutor) => Promise<T>,
  ): Promise<T> => {
    try {
      return await sessions.run(access, options?.scope, work);
    } catch (error) {
      throw mapStorageError(error);
    }
  };
  const findOne = async (query: unknown, options?: PluginStorageCallOptions) =>
    run('read', options, async (executor) => {
      const [row] = await findRows(context, executor, { ...(query as object), limit: 1 });
      return row ?? null;
    });

  return Object.freeze({
    insert: (row, options) => run('write', options, (executor) => insertRow(context, executor, row)),
    insertMany: (rows, options) =>
      run('write', options, async (executor) => {
        if (!Array.isArray(rows)) throw new PluginStorageInvalid('insertMany takes a list of rows.');
        const inserted: Row[] = [];
        for (const row of rows) inserted.push(await insertRow(context, executor, row));
        return inserted;
      }),
    get: async (key, options) => findOne({ where: keyFilter(table, key) }, options),
    find: (query, options) => run('read', options, (executor) => findRows(context, executor, query)),
    findOne: (query, options) => findOne(query ?? {}, options),
    count: (where, options) =>
      run('read', options, async (executor) => {
        const params = new StorageParams(dialect);
        const condition = compileWhere(table, dialect, params, where);
        const [row] = await executor.query(
          `SELECT COUNT(*) AS "count" FROM ${dialect.quote(table.physical)} WHERE ${condition}`,
          params.values,
        );
        return Number(row?.count ?? 0);
      }),
    update: (where, patch, options) =>
      run('write', options, async (executor) => {
        const params = new StorageParams(dialect);
        const assignments = patchAssignments(context, params, patch);
        const condition = compileWhere(table, dialect, params, where);
        const result = await executor.execute(
          `UPDATE ${dialect.quote(table.physical)} SET ${assignments} WHERE ${condition}`,
          params.values,
        );
        return result.affected;
      }),
    delete: (where, options) =>
      run('write', options, async (executor) => {
        const params = new StorageParams(dialect);
        const condition = compileWhere(table, dialect, params, where);
        const result = await executor.execute(
          `DELETE FROM ${dialect.quote(table.physical)} WHERE ${condition}`,
          params.values,
        );
        return result.affected;
      }),
    upsert: (row, options) => run('write', options, (executor) => upsertRow(context, executor, row, options)),
    aggregate: (field, where, options) =>
      run('read', options, (executor) => aggregateRows(context, executor, field, where)),
  } as AnyTableApi);
}

/**
 * The record port of a schema: one frozen API per table, keyed by logical name. Each call resolves its executor when
 * it runs, so a table API retained during bootstrap keeps working once the host connection exists.
 */
export function createRecordPort(
  schema: CompiledSchema,
  dialect: PluginStorageDialect,
  sessions: PluginStorageSessions,
): PluginStorageTablesApi<PluginStorageTables> {
  const apis: Record<string, AnyTableApi> = {};
  for (const [logical, table] of schema) apis[logical] = createTableApi({ table, dialect, sessions });
  return Object.freeze(apis) as PluginStorageTablesApi<PluginStorageTables>;
}
