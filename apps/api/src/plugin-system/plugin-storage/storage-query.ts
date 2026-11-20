import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import type { PluginStorageDialect } from './storage-dialect.port';
import type { CompiledField, CompiledTable } from './storage-model';
import { isOrderable, normalizeFilterValue, type FilterOperand } from './storage-values';

/**
 * Compiles the structured filters, orders and patches of the record port into parameterised SQL. A field name from
 * a plugin is only ever looked up in the declaration; the identifier that reaches the statement is the declared
 * column, quoted by the dialect. Values are always bound parameters.
 */

const MAX_FILTER_DEPTH = 16;

/** Collects the bound parameters of one statement and hands out their markers, up to the engine's limit. */
export class StorageParams {
  readonly values: unknown[] = [];
  constructor(private readonly dialect: PluginStorageDialect) {}

  add(value: unknown, field?: CompiledField): string {
    if (this.values.length >= this.dialect.maxParameters) {
      throw new PluginStorageInvalid(
        `A storage call binds at most ${this.dialect.maxParameters} values; split long in/notIn lists.`,
      );
    }
    this.values.push(value);
    return this.dialect.placeholder(this.values.length, field);
  }
}

const COMPARISONS = { lt: '<', lte: '<=', gt: '>', gte: '>=' } as const;

/** One term as is, several in parentheses, none as `empty`; `always` also wraps a single term. */
function joinTerms(terms: string[], separator: string, empty: string, always = false): string {
  if (terms.length === 0) return empty;
  return terms.length === 1 && !always ? terms[0] : `(${terms.join(separator)})`;
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

  private bind(field: CompiledField, operand: FilterOperand): string {
    return this.params.add(this.dialect.encode(field, operand.value), field);
  }

  private requireOrderable(field: CompiledField, operator: string): void {
    if (!isOrderable(field)) {
      throw new PluginStorageInvalid(`Operator "${operator}" is not supported on ${field.type} field "${field.name}".`);
    }
  }

  /** `undefined` at the top selects every row; anywhere else, and `null` everywhere, a filter must be an object. */
  where(where: unknown, depth = 0): string {
    if (depth > MAX_FILTER_DEPTH) throw new PluginStorageInvalid('The filter is nested too deeply.');
    if (where === undefined && depth === 0) return '1 = 1';
    if (!isPlainObject(where)) throw new PluginStorageInvalid('A filter is an object of field conditions.');
    return joinTerms(
      Object.entries(where).map(([key, value]) => this.term(key, value, depth)),
      ' AND ',
      '1 = 1',
    );
  }

  private term(key: string, value: unknown, depth: number): string {
    if (value === undefined) throw new PluginStorageInvalid(`The filter value of "${key}" is undefined.`);
    if (key === 'and' || key === 'or') return this.group(key, value, depth);
    if (key === 'not') return `(NOT ${this.where(value, depth + 1)})`;
    return this.fieldCondition(fieldOf(this.table, key, 'a filter'), value);
  }

  private group(key: 'and' | 'or', value: unknown, depth: number): string {
    if (!Array.isArray(value)) throw new PluginStorageInvalid(`"${key}" takes a list of filters.`);
    const parts = value.map((part) => this.where(part, depth + 1));
    // An empty conjunction is true and an empty disjunction is false.
    return joinTerms(parts, key === 'and' ? ' AND ' : ' OR ', key === 'and' ? '1 = 1' : '0 = 1', true);
  }

  private fieldCondition(field: CompiledField, condition: unknown): string {
    if (condition === null) return `${this.column(field)} IS NULL`;
    if (!isPlainObject(condition)) return this.operator(field, 'eq', condition);
    const operators = Object.entries(condition);
    if (operators.length === 0) throw new PluginStorageInvalid(`The operator object of "${field.name}" is empty.`);
    this.checkOperators(field, operators);
    return joinTerms(
      operators.map(([name, value]) => this.operator(field, name, value)),
      ' AND ',
      '1 = 1',
    );
  }

  private checkOperators(field: CompiledField, operators: [string, unknown][]): void {
    const missing = operators.find(([, value]) => value === undefined);
    if (missing)
      throw new PluginStorageInvalid(`The operator "${missing[0]}" on "${field.name}" has an undefined value.`);
    const unknown = operators.find(([name]) => !this.operators.has(name));
    if (unknown) throw new PluginStorageInvalid(`Unknown filter operator "${unknown[0]}" on field "${field.name}".`);
    if (field.type === 'json' && operators.some(([name]) => name !== 'isNull' && name !== 'eq')) {
      throw new PluginStorageInvalid(`JSON field "${field.name}" can only be filtered with isNull.`);
    }
  }

  /** The markers of the list entries a stored value can equal (a decimal finer than the scale equals none). */
  private list(field: CompiledField, operator: string, value: unknown): string[] {
    if (!Array.isArray(value)) throw new PluginStorageInvalid(`"${operator}" on "${field.name}" takes a list.`);
    return value
      .map((entry) => normalizeFilterValue(field, entry, operator))
      .filter((operand) => operand.exact)
      .map((operand) => this.bind(field, operand));
  }

  /** Builds the condition of one operator; every name here is also a valid filter operator. */
  private readonly operators = new Map<string, (field: CompiledField, column: string, value: unknown) => string>([
    ['eq', (field, column, value) => this.equals(field, column, value)],
    ['ne', (field, column, value) => this.notEquals(field, column, value)],
    ['in', (field, column, value) => this.membership(field, column, 'in', value)],
    ['notIn', (field, column, value) => this.membership(field, column, 'notIn', value)],
    ['lt', (field, column, value) => this.comparison(field, column, 'lt', value)],
    ['lte', (field, column, value) => this.comparison(field, column, 'lte', value)],
    ['gt', (field, column, value) => this.comparison(field, column, 'gt', value)],
    ['gte', (field, column, value) => this.comparison(field, column, 'gte', value)],
    ['between', (field, column, value) => this.between(field, column, value)],
    ['isNull', (field, column, value) => this.nullTest(field, column, value)],
    ['startsWith', (field, column, value) => this.startsWith(field, column, value)],
  ]);

  private operator(field: CompiledField, name: string, value: unknown): string {
    const build = this.operators.get(name) as (field: CompiledField, column: string, value: unknown) => string;
    return build(field, this.column(field), value);
  }

  private nullTest(field: CompiledField, column: string, value: unknown): string {
    if (typeof value !== 'boolean') throw new PluginStorageInvalid(`"isNull" on "${field.name}" takes a boolean.`);
    return value ? `${column} IS NULL` : `${column} IS NOT NULL`;
  }

  private equals(field: CompiledField, column: string, value: unknown): string {
    if (field.type === 'json' && value !== null) {
      throw new PluginStorageInvalid(`JSON field "${field.name}" can only be filtered with isNull.`);
    }
    if (value === null) return `${column} IS NULL`;
    const operand = normalizeFilterValue(field, value, 'eq');
    return operand.exact ? `${column} = ${this.bind(field, operand)}` : '0 = 1';
  }

  // SQL three-valued logic: a row without a value never matches `ne`; use isNull to find it.
  private notEquals(field: CompiledField, column: string, value: unknown): string {
    if (value === null) return `${column} IS NOT NULL`;
    const operand = normalizeFilterValue(field, value, 'ne');
    return operand.exact ? `${column} <> ${this.bind(field, operand)}` : `${column} IS NOT NULL`;
  }

  /**
   * A decimal operand finer than the scale lies strictly between two stored values, so it compares like the stored
   * value just below it (`value`): below or equal for lt/lte, above for gt/gte.
   */
  private comparison(field: CompiledField, column: string, name: keyof typeof COMPARISONS, value: unknown): string {
    this.requireOrderable(field, name);
    const operand = normalizeFilterValue(field, value, name);
    const operator = operand.exact ? COMPARISONS[name] : name === 'lt' || name === 'lte' ? '<=' : '>';
    return `${column} ${operator} ${this.bind(field, operand)}`;
  }

  private between(field: CompiledField, column: string, value: unknown): string {
    this.requireOrderable(field, 'between');
    if (!Array.isArray(value) || value.length !== 2) throw new PluginStorageInvalid('"between" takes [low, high].');
    const [low, high] = value.map((bound) => normalizeFilterValue(field, bound, 'between'));
    const [from, to] = [this.bind(field, low), this.bind(field, high)];
    // `high` compares the same either way (<= the value or the stored value below it); `low` is exclusive when finer.
    return low.exact ? `${column} BETWEEN ${from} AND ${to}` : `(${column} > ${from} AND ${column} <= ${to})`;
  }

  private startsWith(field: CompiledField, column: string, value: unknown): string {
    if ((field.type !== 'string' && field.type !== 'text') || typeof value !== 'string') {
      throw new PluginStorageInvalid(`"startsWith" takes a string and applies to string and text fields.`);
    }
    // The length in characters (code points), as the engines count them; JavaScript counts UTF-16 units.
    return this.dialect.startsWith(column, this.params.add(value), [...value].length);
  }

  /** Three-valued logic again: NULL rows never match notIn. An empty list matches nothing (in), every value (notIn). */
  private membership(field: CompiledField, column: string, name: 'in' | 'notIn', value: unknown): string {
    const items = this.list(field, name, value).join(', ');
    if (name === 'in') return items ? `${column} IN (${items})` : '0 = 1';
    return items ? `${column} NOT IN (${items})` : `${column} IS NOT NULL`;
  }

  orderBy(orderBy: unknown): string {
    if (orderBy !== undefined && !Array.isArray(orderBy)) {
      throw new PluginStorageInvalid('orderBy is a list of { field, direction }.');
    }
    const terms: string[] = [];
    const seen = new Set<string>();
    for (const entry of (orderBy ?? []) as unknown[]) {
      const { field, direction } = this.orderEntry(entry);
      if (seen.has(field.name)) continue;
      seen.add(field.name);
      terms.push(this.dialect.orderTerm(this.column(field), direction));
    }
    // The primary key breaks ties, so a page of a sorted list is stable.
    for (const key of this.table.primaryKey) {
      if (!seen.has(key)) terms.push(this.dialect.orderTerm(this.column(fieldOf(this.table, key, 'orderBy')), 'asc'));
    }
    return `ORDER BY ${terms.join(', ')}`;
  }

  private orderEntry(entry: unknown): { field: CompiledField; direction: 'asc' | 'desc' } {
    const field = fieldOf(this.table, (entry as { field?: unknown } | null)?.field, 'orderBy');
    this.requireOrderable(field, 'orderBy');
    const direction = (entry as { direction?: unknown }).direction ?? 'asc';
    if (direction !== 'asc' && direction !== 'desc') throw new PluginStorageInvalid('direction is "asc" or "desc".');
    return { field, direction };
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
