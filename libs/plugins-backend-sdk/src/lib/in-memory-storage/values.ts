import { PluginStorageInvalid, type PluginStorageField, type PluginStorageFieldType } from '../plugin-storage';

/** A stored row: field name to normalized value. Rows are immutable once stored; updates replace them. */
export type Row = Record<string, unknown>;

interface TypeHandler {
  /** Returns the normalized value or throws an Error whose message names what is wrong. */
  normalize(field: PluginStorageField, value: unknown, lenient: boolean): unknown;
  /** Absent for types that cannot be compared (json). */
  compare?(a: unknown, b: unknown): number;
  clone(value: unknown): unknown;
}

const ZERO = BigInt(0);
const cmp = <T>(a: T, b: T): number => (a < b ? -1 : a > b ? 1 : 0);
const identity = (value: unknown): unknown => value;
/** Decimals are exact up to this many digits on every backend (the host refuses a wider declaration). */
export const MAX_DECIMAL_PRECISION = 15;
const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 64;

/** Orders strings by code point, as the engines do (UTF-8 byte order); JavaScript's `<` compares UTF-16 units. */
function compareText(a: unknown, b: unknown): number {
  const [left, right] = [a as string, b as string];
  if (left === right) return 0;
  const [x, y] = [[...left], [...right]];
  for (let index = 0; index < Math.min(x.length, y.length); index++) {
    if (x[index] !== y[index]) return cmp(x[index].codePointAt(0) as number, y[index].codePointAt(0) as number);
  }
  return cmp(x.length, y.length);
}

function stringValue(value: unknown): string {
  if (typeof value !== 'string') throw new Error('must be a string');
  return value;
}

function boundedString(field: PluginStorageField, value: unknown, lenient: boolean): string {
  const text = stringValue(value);
  const max = field.length ?? 255;
  if (!lenient && text.length > max) throw new Error(`must be at most ${max} characters`);
  return text;
}

function integerValue(_field: PluginStorageField, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error('must be a safe integer');
  return value;
}

function booleanValue(_field: PluginStorageField, value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('must be a boolean');
  return value;
}

function timestampValue(_field: PluginStorageField, value: unknown): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error('must be a valid Date');
  return new Date(value.getTime());
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
function dayValue(_field: PluginStorageField, value: unknown, lenient: boolean): string {
  const match = DAY.exec(stringValue(value));
  if (!match) throw new Error('must be a day such as "2026-03-31"');
  if (lenient) return match[0];
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error('must be a real calendar day');
  }
  return match[0];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** A UUID in any case; stored lowercase. A filter operand is not checked further (a malformed one matches nothing). */
function uuidValue(_field: PluginStorageField, value: unknown, lenient: boolean): string {
  const text = stringValue(value).toLowerCase();
  if (!lenient && !UUID.test(text)) throw new Error('must be a canonical uuid');
  return text;
}

const isPlainJsonObject = (value: unknown): boolean => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

/** Accepts plain JSON only: objects, arrays, strings, finite numbers, booleans and null, nested at most 64 deep. */
function checkJson(value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) throw new Error('is JSON nested too deeply');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('must hold finite JSON numbers only');
    return;
  }
  const children = Array.isArray(value) ? value : isPlainJsonObject(value) ? Object.values(value as object) : null;
  if (!children) throw new Error('must be plain JSON (objects, arrays, strings, finite numbers, booleans)');
  for (const child of children) checkJson(child, depth + 1);
}

function jsonValue(_field: PluginStorageField, value: unknown): unknown {
  if (value === undefined) throw new Error('must be a JSON value');
  checkJson(value, 0);
  const text = JSON.stringify(value);
  if (text.length > MAX_JSON_BYTES) throw new Error(`is larger than ${MAX_JSON_BYTES} bytes`);
  return JSON.parse(text);
}

interface Decimal {
  negative: boolean;
  int: string;
  frac: string;
}

const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;
function parseDecimal(value: unknown): Decimal {
  const match = DECIMAL.exec(stringValue(value));
  if (!match) throw new Error('must be a decimal string such as "12.50"');
  return { negative: match[1] === '-', int: match[2].replace(/^0+(?=\d)/, ''), frac: match[3] ?? '' };
}

function scaled(decimal: Decimal, scale: number): bigint {
  const magnitude = BigInt(decimal.int + decimal.frac.padEnd(scale, '0'));
  return decimal.negative ? -magnitude : magnitude;
}

/** Formats a scaled integer as a decimal string with exactly `scale` fraction digits. */
export function formatDecimal(value: bigint, scale: number): string {
  const negative = value < ZERO;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const whole = digits.slice(0, digits.length - scale);
  const fraction = scale > 0 ? `.${digits.slice(digits.length - scale)}` : '';
  return `${negative ? '-' : ''}${whole}${fraction}`;
}

function decimalValue(field: PluginStorageField, value: unknown, lenient: boolean): string {
  const parsed = parseDecimal(value);
  if (lenient) return formatDecimal(scaled(parsed, parsed.frac.length), parsed.frac.length);
  const scale = field.scale ?? 0;
  const integerDigits = parsed.int === '0' ? 0 : parsed.int.length;
  if (parsed.frac.length > scale) throw new Error(`has more than ${scale} fraction digits`);
  const precision = field.precision ?? MAX_DECIMAL_PRECISION;
  if (integerDigits > precision - scale) throw new Error(`exceeds precision ${precision}`);
  return formatDecimal(scaled(parsed, scale), scale);
}

function compareDecimals(a: unknown, b: unknown): number {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  return cmp(scaled(left, scale), scaled(right, scale));
}

const HANDLERS: Record<PluginStorageFieldType, TypeHandler> = {
  string: { normalize: boundedString, compare: compareText, clone: identity },
  text: { normalize: (_f, value) => stringValue(value), compare: compareText, clone: identity },
  integer: { normalize: integerValue, compare: cmp, clone: identity },
  decimal: { normalize: decimalValue, compare: compareDecimals, clone: identity },
  boolean: { normalize: booleanValue, compare: (a, b) => cmp(Number(a), Number(b)), clone: identity },
  timestamp: {
    normalize: timestampValue,
    compare: (a, b) => cmp((a as Date).getTime(), (b as Date).getTime()),
    clone: (value) => new Date((value as Date).getTime()),
  },
  date: { normalize: dayValue, compare: cmp, clone: identity },
  json: { normalize: jsonValue, clone: (value) => JSON.parse(JSON.stringify(value)) },
  uuid: { normalize: uuidValue, compare: compareText, clone: identity },
};

/**
 * Normalizes a value written to or filtered on a field. `label` names the field in the error. Null is allowed only
 * for nullable fields (and never in filters, which use `isNull`). `lenient` is the check of a filter operand: its
 * type and form only, not the column's limits (string length, decimal scale and precision, calendar day, UUID form).
 */
export function normalizeValue(label: string, field: PluginStorageField, value: unknown, lenient = false): unknown {
  if (value === null) {
    if (field.nullable && !lenient) return null;
    throw new PluginStorageInvalid(
      lenient
        ? `${label}: null is not a filter operand; use isNull, or "or" with isNull.`
        : `${label} must not be null.`,
    );
  }
  try {
    return HANDLERS[field.type].normalize(field, value, lenient);
  } catch (error) {
    throw new PluginStorageInvalid(`${label} ${(error as Error).message}.`);
  }
}

/** Orders two non-null values of a field type; throws for types that cannot be ordered. */
export function compareValues(field: PluginStorageField, a: unknown, b: unknown): number {
  const compare = HANDLERS[field.type].compare;
  if (!compare) throw new PluginStorageInvalid(`A ${field.type} field cannot be compared.`);
  return compare(a, b);
}

/** Whether values of the field can be tested for equality in filters (every type but json). */
export function isComparable(field: PluginStorageField): boolean {
  return HANDLERS[field.type].compare !== undefined;
}

/** Whether the field's type has an order for comparisons, `between` and `orderBy` (not json, not boolean). */
export function isOrderable(field: PluginStorageField): boolean {
  return isComparable(field) && field.type !== 'boolean';
}

export function valuesEqual(field: PluginStorageField, a: unknown, b: unknown): boolean {
  if (a === null || b === null) return a === b;
  return isComparable(field) ? compareValues(field, a, b) === 0 : JSON.stringify(a) === JSON.stringify(b);
}

/** Copy handed to the plugin, so it can never mutate a stored row. */
export function cloneValue(field: PluginStorageField, value: unknown): unknown {
  return value === null ? null : HANDLERS[field.type].clone(value);
}

/** Exact sum of decimal strings, formatted with the field's scale. */
export function sumDecimals(field: PluginStorageField, values: readonly unknown[]): string {
  const scale = field.scale ?? 0;
  return formatDecimal(
    values.reduce<bigint>((total, value) => total + scaled(parseDecimal(value), scale), ZERO),
    scale,
  );
}
