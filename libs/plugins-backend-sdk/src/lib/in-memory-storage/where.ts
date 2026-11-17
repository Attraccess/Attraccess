import { PluginStorageInvalid, type PluginStorageField, type PluginStorageOrder } from '../plugin-storage';
import type { TableMeta } from './schema';
import { compareValues, isComparable, normalizeValue, type Row } from './values';

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

function requireOrdering(ctx: FieldContext, operator: string): void {
  if (!isComparable(ctx.field)) {
    throw new PluginStorageInvalid(`${ctx.label}: "${operator}" is not supported on ${ctx.field.type} fields.`);
  }
}

const operand = (ctx: FieldContext, value: unknown) => normalizeValue(ctx.label, ctx.field, value, true);

function ordered(ctx: FieldContext, operator: string, value: unknown, test: (order: number) => boolean) {
  requireOrdering(ctx, operator);
  const wanted = operand(ctx, value);
  return (stored: unknown): Tri => (stored === null ? null : test(compareValues(ctx.field, stored, wanted)));
}

function operandList(ctx: FieldContext, operator: string, values: unknown): unknown[] {
  requireOrdering(ctx, operator);
  if (!Array.isArray(values)) throw new PluginStorageInvalid(`${ctx.label}: "${operator}" needs an array.`);
  return values.map((value) => operand(ctx, value));
}

function membership(ctx: FieldContext, operator: string, values: unknown, negate: boolean) {
  const wanted = operandList(ctx, operator, values);
  return (stored: unknown): Tri => {
    if (wanted.length === 0) return negate;
    if (stored === null) return null;
    const found = wanted.some((value) => compareValues(ctx.field, stored, value) === 0);
    return negate ? !found : found;
  };
}

function between(ctx: FieldContext, values: unknown) {
  const [low, high] = operandList(ctx, 'between', values);
  if (!Array.isArray(values) || values.length !== 2) {
    throw new PluginStorageInvalid(`${ctx.label}: "between" needs [low, high].`);
  }
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
  eq: (ctx, value) => (value === null ? nullTest(ctx, true) : ordered(ctx, 'eq', value, (o) => o === 0)),
  ne: (ctx, value) => (value === null ? nullTest(ctx, false) : ordered(ctx, 'ne', value, (o) => o !== 0)),
  lt: (ctx, value) => ordered(ctx, 'lt', value, (o) => o < 0),
  lte: (ctx, value) => ordered(ctx, 'lte', value, (o) => o <= 0),
  gt: (ctx, value) => ordered(ctx, 'gt', value, (o) => o > 0),
  gte: (ctx, value) => ordered(ctx, 'gte', value, (o) => o >= 0),
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
  const field = meta.fields[name];
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

function compileList(meta: TableMeta, key: string, nodes: unknown): Predicate[] {
  if (!Array.isArray(nodes)) throw new PluginStorageInvalid(`${meta.name}: "${key}" needs an array of filters.`);
  return nodes.map((node) => compileWhere(meta, node));
}

/** Compiles a structured filter into a predicate. Rejects undeclared fields and unsupported operators. */
export function compileWhere(meta: TableMeta, where: unknown): Predicate {
  if (where === undefined) return () => true;
  if (!isPlainObject(where)) throw new PluginStorageInvalid(`${meta.name}: a filter must be an object.`);
  const keys = Object.keys(where);
  const [only] = keys;
  if (keys.length === 1 && !(only in meta.fields)) {
    if (only === 'and') return and(compileList(meta, only, where[only]));
    if (only === 'or') return or(compileList(meta, only, where[only]));
    if (only === 'not') {
      const inner = compileWhere(meta, where[only]);
      return (row) => {
        const value = inner(row);
        return value === null ? null : !value;
      };
    }
  }
  return and(keys.map((key) => compileFieldFilter(meta, key, where[key])));
}

export function matches(predicate: Predicate, row: Row): boolean {
  return predicate(row) === true;
}

/** Orders rows by the given fields. NULL sorts first ascending (and last descending); ties keep insertion order. */
export function compileOrder(meta: TableMeta, orderBy: ReadonlyArray<PluginStorageOrder<Row>> | undefined) {
  const keys = (orderBy ?? []).map((order) => {
    const field = meta.fields[order.field];
    if (!field) throw new PluginStorageInvalid(`${meta.name}: cannot order by the unknown field "${order.field}".`);
    if (!isComparable(field))
      throw new PluginStorageInvalid(`${meta.name}.${order.field}: cannot order by a json field.`);
    if (order.direction !== undefined && order.direction !== 'asc' && order.direction !== 'desc') {
      throw new PluginStorageInvalid(`${meta.name}: order direction must be "asc" or "desc".`);
    }
    return { name: order.field, field, sign: order.direction === 'desc' ? -1 : 1 };
  });
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
