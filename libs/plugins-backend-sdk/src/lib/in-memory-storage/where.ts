import { PluginStorageInvalid, type PluginStorageField, type PluginStorageOrder } from '../plugin-storage';
import type { TableMeta } from './schema';
import { compareValues, isComparable, isOrderable, normalizeValue, type Row } from './values';

/** SQL three-valued logic: a comparison with a NULL value is unknown (null), which a filter does not match. */
type Tri = boolean | null;
export type Predicate = (row: Row) => Tri;

interface FieldContext {
  readonly label: string;
  readonly field: PluginStorageField;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** Equality operators (eq, ne, in, notIn) need a comparable type; ordering operators an orderable one. */
function requireType(ctx: FieldContext, operator: string, ordering: boolean): void {
  if (!(ordering ? isOrderable(ctx.field) : isComparable(ctx.field))) {
    throw new PluginStorageInvalid(`${ctx.label}: "${operator}" is not supported on ${ctx.field.type} fields.`);
  }
}

const operand = (ctx: FieldContext, value: unknown) => normalizeValue(ctx.label, ctx.field, value, true);

function compared(ctx: FieldContext, operator: string, value: unknown, test: (order: number) => boolean) {
  requireType(ctx, operator, operator !== 'eq' && operator !== 'ne');
  const wanted = operand(ctx, value);
  return (stored: unknown): Tri => (stored === null ? null : test(compareValues(ctx.field, stored, wanted)));
}

function operandList(ctx: FieldContext, operator: string, values: unknown, ordering: boolean): unknown[] {
  requireType(ctx, operator, ordering);
  if (!Array.isArray(values)) throw new PluginStorageInvalid(`${ctx.label}: "${operator}" needs an array.`);
  return values.map((value) => operand(ctx, value));
}

/** SQL again: a NULL value matches neither `in` nor `notIn`; an empty list matches nothing (in), any value (notIn). */
function membership(ctx: FieldContext, operator: string, values: unknown, negate: boolean) {
  const wanted = operandList(ctx, operator, values, false);
  return (stored: unknown): Tri => {
    if (stored === null) return null;
    const found = wanted.some((value) => compareValues(ctx.field, stored, value) === 0);
    return negate ? !found : found;
  };
}

function between(ctx: FieldContext, values: unknown) {
  if (!Array.isArray(values) || values.length !== 2) {
    throw new PluginStorageInvalid(`${ctx.label}: "between" needs [low, high].`);
  }
  const [low, high] = operandList(ctx, 'between', values, true);
  return (stored: unknown): Tri =>
    stored === null ? null : compareValues(ctx.field, stored, low) >= 0 && compareValues(ctx.field, stored, high) <= 0;
}

function startsWith(ctx: FieldContext, prefix: unknown) {
  if (ctx.field.type !== 'string' && ctx.field.type !== 'text') {
    throw new PluginStorageInvalid(`${ctx.label}: "startsWith" is for string and text fields.`);
  }
  if (typeof prefix !== 'string') throw new PluginStorageInvalid(`${ctx.label}: "startsWith" needs a string.`);
  return (stored: unknown): Tri => (stored === null ? null : (stored as string).startsWith(prefix));
}

function nullTest(ctx: FieldContext, wanted: unknown) {
  if (typeof wanted !== 'boolean') throw new PluginStorageInvalid(`${ctx.label}: "isNull" needs a boolean.`);
  return (stored: unknown): Tri => (stored === null) === wanted;
}

type OperatorCompiler = (ctx: FieldContext, value: unknown) => (stored: unknown) => Tri;
const OPERATORS: Record<string, OperatorCompiler> = {
  eq: (ctx, value) => (value === null ? nullTest(ctx, true) : compared(ctx, 'eq', value, (o) => o === 0)),
  ne: (ctx, value) => (value === null ? nullTest(ctx, false) : compared(ctx, 'ne', value, (o) => o !== 0)),
  lt: (ctx, value) => compared(ctx, 'lt', value, (o) => o < 0),
  lte: (ctx, value) => compared(ctx, 'lte', value, (o) => o <= 0),
  gt: (ctx, value) => compared(ctx, 'gt', value, (o) => o > 0),
  gte: (ctx, value) => compared(ctx, 'gte', value, (o) => o >= 0),
  in: (ctx, value) => membership(ctx, 'in', value, false),
  notIn: (ctx, value) => membership(ctx, 'notIn', value, true),
  between,
  isNull: nullTest,
  startsWith,
};

function and(predicates: readonly Predicate[]): Predicate {
  return (row) => {
    let result: Tri = true;
    for (const predicate of predicates) {
      const value = predicate(row);
      if (value === false) return false;
      if (value === null) result = null;
    }
    return result;
  };
}

function or(predicates: readonly Predicate[]): Predicate {
  return (row) => {
    let result: Tri = false;
    for (const predicate of predicates) {
      const value = predicate(row);
      if (value === true) return true;
      if (value === null) result = null;
    }
    return result;
  };
}

function compileFieldFilter(meta: TableMeta, name: string, filter: unknown): Predicate {
  const field = Object.hasOwn(meta.fields, name) ? meta.fields[name] : undefined;
  if (!field) throw new PluginStorageInvalid(`${meta.name}: unknown field "${name}" in a filter.`);
  const ctx: FieldContext = { label: `${meta.name}.${name}`, field };
  if (filter === undefined) {
    throw new PluginStorageInvalid(`${ctx.label}: a filter value is undefined (use null to match NULL).`);
  }
  const entries: [string, unknown][] = isPlainObject(filter) ? Object.entries(filter) : [['eq', filter]];
  if (entries.length === 0) throw new PluginStorageInvalid(`${ctx.label}: an empty operator object.`);
  const tests = entries.map(([operator, value]) => {
    const compile = Object.hasOwn(OPERATORS, operator) ? OPERATORS[operator] : undefined;
    if (!compile) throw new PluginStorageInvalid(`${ctx.label}: unknown operator "${operator}".`);
    return compile(ctx, value);
  });
  return and(tests.map((test) => (row: Row) => test(row[name])));
}

const MAX_FILTER_DEPTH = 16;

function compileList(meta: TableMeta, key: string, nodes: unknown, depth: number): Predicate[] {
  if (!Array.isArray(nodes)) throw new PluginStorageInvalid(`${meta.name}: "${key}" needs an array of filters.`);
  return nodes.map((node) => compileNode(meta, node, depth + 1));
}

/** One key of a filter object: a combinator (`and`, `or`, `not`; never field names) or a field condition. */
function compileKey(meta: TableMeta, key: string, value: unknown, depth: number): Predicate {
  if (key === 'and') return and(compileList(meta, key, value, depth));
  if (key === 'or') return or(compileList(meta, key, value, depth));
  if (key === 'not') {
    const inner = compileNode(meta, value, depth + 1);
    return (row) => {
      const result = inner(row);
      return result === null ? null : !result;
    };
  }
  return compileFieldFilter(meta, key, value);
}

function compileNode(meta: TableMeta, where: unknown, depth: number): Predicate {
  if (depth > MAX_FILTER_DEPTH) throw new PluginStorageInvalid(`${meta.name}: the filter is nested too deeply.`);
  if (!isPlainObject(where)) throw new PluginStorageInvalid(`${meta.name}: a filter must be an object.`);
  return and(Object.keys(where).map((key) => compileKey(meta, key, where[key], depth)));
}

/**
 * Compiles a structured filter into a predicate. Rejects undeclared fields and unsupported operators. A missing
 * filter (or `{}`) matches every row; `null` and other non-objects are rejected at every level. Combinators and
 * field conditions of one object are combined with AND.
 */
export function compileWhere(meta: TableMeta, where: unknown): Predicate {
  if (where === undefined) return () => true;
  return compileNode(meta, where, 0);
}

export function matches(predicate: Predicate, row: Row): boolean {
  return predicate(row) === true;
}

interface OrderKey {
  readonly name: string;
  readonly field: PluginStorageField;
  readonly sign: number;
}

function orderKey(meta: TableMeta, order: unknown): OrderKey {
  const { field: name, direction } = (order ?? {}) as { field?: string; direction?: unknown };
  const field = typeof name === 'string' && Object.hasOwn(meta.fields, name) ? meta.fields[name] : undefined;
  if (!field) throw new PluginStorageInvalid(`${meta.name}: cannot order by the unknown field "${String(name)}".`);
  if (!isOrderable(field))
    throw new PluginStorageInvalid(`${meta.name}.${name}: cannot order by a ${field.type} field.`);
  if (direction !== undefined && direction !== 'asc' && direction !== 'desc') {
    throw new PluginStorageInvalid(`${meta.name}: order direction must be "asc" or "desc".`);
  }
  return { name: name as string, field, sign: direction === 'desc' ? -1 : 1 };
}

/**
 * Orders rows by the given fields, then by the primary key ascending (as the host does), so the order is total. NULL
 * sorts first ascending (and last descending). A field listed twice counts once.
 */
export function compileOrder(meta: TableMeta, orderBy: ReadonlyArray<PluginStorageOrder<Row>> | undefined) {
  if (orderBy !== undefined && !Array.isArray(orderBy)) {
    throw new PluginStorageInvalid(`${meta.name}: orderBy is a list of { field, direction }.`);
  }
  const keys: OrderKey[] = [];
  for (const order of orderBy ?? []) {
    const key = orderKey(meta, order);
    if (!keys.some((known) => known.name === key.name)) keys.push(key);
  }
  for (const name of meta.primaryKey) {
    if (!keys.some((known) => known.name === name)) keys.push({ name, field: meta.fields[name], sign: 1 });
  }
  return (a: Row, b: Row): number => {
    for (const { name, field, sign } of keys) {
      const [left, right] = [a[name], b[name]];
      if (left === right) continue;
      const order = left === null ? -1 : right === null ? 1 : compareValues(field, left, right);
      if (order !== 0) return order * sign;
    }
    return 0;
  };
}
