import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import type { PluginStorageDialect } from './storage-dialect.port';
import type { CompiledField, CompiledTable } from './storage-model';
import { isOrderable, normalizeValue } from './storage-values';

/**
 * Compiles the structured filters, orders and patches of the record port into parameterised SQL. A field name from
 * a plugin is only ever looked up in the declaration; the identifier that reaches the statement is the declared
 * column, quoted by the dialect. Values are always bound parameters.
 */

const MAX_IN_LIST = 20_000;
const MAX_FILTER_DEPTH = 16;
const OPERATOR_NAMES = new Set([
  'eq',
  'ne',
  'in',
  'notIn',
  'lt',
  'lte',
  'gt',
  'gte',
  'between',
  'isNull',
  'startsWith',
]);

/** Collects the bound parameters of one statement and hands out their markers. */
export class StorageParams {
  readonly values: unknown[] = [];
  constructor(private readonly dialect: PluginStorageDialect) {}

  add(value: unknown): string {
    this.values.push(value);
    return this.dialect.placeholder(this.values.length);
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || value instanceof Date) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

export function fieldOf(table: CompiledTable, name: unknown, what: string): CompiledField {
  const field = typeof name === 'string' ? table.fields.get(name) : undefined;
  if (!field) throw new PluginStorageInvalid(`Unknown field "${String(name)}" in ${what} of table "${table.logical}".`);
  return field;
}

class Compiler {
  constructor(
    private readonly table: CompiledTable,
    private readonly dialect: PluginStorageDialect,
    private readonly params: StorageParams,
  ) {}

  private column(field: CompiledField): string {
    return this.dialect.quote(field.column);
  }

  private bind(field: CompiledField, value: unknown): string {
    return this.params.add(this.dialect.encode(field, normalizeValue(field, value)));
  }

  private requireOrderable(field: CompiledField, operator: string): void {
    if (!isOrderable(field)) {
      throw new PluginStorageInvalid(`Operator "${operator}" is not supported on ${field.type} field "${field.name}".`);
    }
  }

  where(where: unknown, depth = 0): string {
    if (depth > MAX_FILTER_DEPTH) throw new PluginStorageInvalid('The filter is nested too deeply.');
    if (where === undefined || where === null) return '1 = 1';
    if (!isPlainObject(where)) throw new PluginStorageInvalid('A filter is an object of field conditions.');
    const terms: string[] = [];
    for (const [key, value] of Object.entries(where)) {
      if (value === undefined) throw new PluginStorageInvalid(`The filter value of "${key}" is undefined.`);
      if (key === 'and' || key === 'or') {
        if (!Array.isArray(value)) throw new PluginStorageInvalid(`"${key}" takes a list of filters.`);
        const parts = value.map((part) => this.where(part, depth + 1));
        terms.push(
          parts.length === 0
            ? key === 'and'
              ? '1 = 1'
              : '0 = 1'
            : `(${parts.join(key === 'and' ? ' AND ' : ' OR ')})`,
        );
      } else if (key === 'not') {
        terms.push(`(NOT ${this.where(value, depth + 1)})`);
      } else {
        terms.push(this.fieldCondition(fieldOf(this.table, key, 'a filter'), value));
      }
    }
    return terms.length === 0 ? '1 = 1' : terms.length === 1 ? terms[0] : `(${terms.join(' AND ')})`;
  }

  private fieldCondition(field: CompiledField, condition: unknown): string {
    if (condition === null) return `${this.column(field)} IS NULL`;
    if (!isPlainObject(condition)) return this.operator(field, 'eq', condition);
    const operators = Object.entries(condition);
    const missing = operators.find(([, value]) => value === undefined);
    if (missing)
      throw new PluginStorageInvalid(`The operator "${missing[0]}" on "${field.name}" has an undefined value.`);
    const unknown = operators.find(([name]) => !OPERATOR_NAMES.has(name));
    if (unknown) throw new PluginStorageInvalid(`Unknown filter operator "${unknown[0]}" on field "${field.name}".`);
    if (field.type === 'json' && operators.some(([name]) => name !== 'isNull' && name !== 'eq')) {
      throw new PluginStorageInvalid(`JSON field "${field.name}" can only be filtered with isNull.`);
    }
    if (operators.length === 0) return '1 = 1';
    return operators.length === 1
      ? this.operator(field, operators[0][0], operators[0][1])
      : `(${operators.map(([name, value]) => this.operator(field, name, value)).join(' AND ')})`;
  }

  private list(field: CompiledField, operator: string, value: unknown): { values: string[]; hasNull: boolean } {
    if (!Array.isArray(value)) throw new PluginStorageInvalid(`"${operator}" on "${field.name}" takes a list.`);
    if (value.length > MAX_IN_LIST)
      throw new PluginStorageInvalid(`"${operator}" takes at most ${MAX_IN_LIST} values.`);
    const present = value.filter((entry) => entry !== null);
    return {
      values: present.map((entry) => this.bind({ ...field, nullable: false }, entry)),
      hasNull: present.length < value.length,
    };
  }

  private operator(field: CompiledField, name: string, value: unknown): string {
    const column = this.column(field);
    switch (name) {
      case 'eq':
        if (field.type === 'json' && value !== null) {
          throw new PluginStorageInvalid(`JSON field "${field.name}" can only be filtered with isNull.`);
        }
        return value === null ? `${column} IS NULL` : `${column} = ${this.bind(field, value)}`;
      case 'ne':
        // SQL three-valued logic: a row without a value never matches `ne`; use isNull to find it.
        return value === null ? `${column} IS NOT NULL` : `${column} <> ${this.bind(field, value)}`;
      case 'in':
      case 'notIn':
        return this.membership(field, name, value);
      case 'lt':
      case 'lte':
      case 'gt':
      case 'gte': {
        this.requireOrderable(field, name);
        const symbol = { lt: '<', lte: '<=', gt: '>', gte: '>=' }[name];
        return `${column} ${symbol} ${this.bind(field, value)}`;
      }
      case 'between': {
        this.requireOrderable(field, name);
        if (!Array.isArray(value) || value.length !== 2) throw new PluginStorageInvalid('"between" takes [low, high].');
        return `${column} BETWEEN ${this.bind(field, value[0])} AND ${this.bind(field, value[1])}`;
      }
      case 'isNull':
        return value === false ? `${column} IS NOT NULL` : `${column} IS NULL`;
      case 'startsWith': {
        if ((field.type !== 'string' && field.type !== 'text') || typeof value !== 'string') {
          throw new PluginStorageInvalid(`"startsWith" takes a string and applies to string and text fields.`);
        }
        return this.dialect.startsWith(column, this.params.add(value), value.length);
      }
      default:
        throw new PluginStorageInvalid(`Unknown filter operator "${name}".`);
    }
  }

  private membership(field: CompiledField, name: 'in' | 'notIn', value: unknown): string {
    const column = this.column(field);
    const { values, hasNull } = this.list(field, name, value);
    if (name === 'notIn' && hasNull) return '0 = 1';
    const inList = values.length > 0 ? `${column} IN (${values.join(', ')})` : '0 = 1';
    if (name === 'in') return hasNull ? `(${inList} OR ${column} IS NULL)` : inList;
    // Three-valued logic again: NULL rows never match notIn.
    const notIn = values.length > 0 ? `${column} NOT IN (${values.join(', ')})` : `${column} IS NOT NULL`;
    return notIn;
  }

  orderBy(orderBy: unknown): string {
    const terms: string[] = [];
    const seen = new Set<string>();
    if (orderBy !== undefined) {
      if (!Array.isArray(orderBy)) throw new PluginStorageInvalid('orderBy is a list of { field, direction }.');
      for (const entry of orderBy) {
        const field = fieldOf(this.table, (entry as { field?: unknown })?.field, 'orderBy');
        this.requireOrderable(field, 'orderBy');
        const direction = (entry as { direction?: unknown }).direction ?? 'asc';
        if (direction !== 'asc' && direction !== 'desc')
          throw new PluginStorageInvalid('direction is "asc" or "desc".');
        if (seen.has(field.name)) continue;
        seen.add(field.name);
        terms.push(this.dialect.orderTerm(this.column(field), direction));
      }
    }
    // The primary key breaks ties, so a page of a sorted list is stable.
    for (const key of this.table.primaryKey) {
      if (!seen.has(key)) terms.push(this.dialect.orderTerm(this.column(fieldOf(this.table, key, 'orderBy')), 'asc'));
    }
    return `ORDER BY ${terms.join(', ')}`;
  }
}

export interface QueryParts {
  where: string;
  orderBy: string;
  limit: string;
}

function integerOption(name: string, value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PluginStorageInvalid(`${name} must be a non-negative integer.`);
  }
  return value;
}

export function compileQuery(
  table: CompiledTable,
  dialect: PluginStorageDialect,
  params: StorageParams,
  query: { where?: unknown; orderBy?: unknown; limit?: unknown; offset?: unknown } = {},
): QueryParts {
  if (typeof query !== 'object' || query === null) throw new PluginStorageInvalid('A query is an object.');
  const compiler = new Compiler(table, dialect, params);
  return {
    where: compiler.where(query.where),
    orderBy: compiler.orderBy(query.orderBy),
    limit: dialect.limit(integerOption('limit', query.limit), integerOption('offset', query.offset)),
  };
}

export function compileWhere(
  table: CompiledTable,
  dialect: PluginStorageDialect,
  params: StorageParams,
  where: unknown,
): string {
  return new Compiler(table, dialect, params).where(where);
}
