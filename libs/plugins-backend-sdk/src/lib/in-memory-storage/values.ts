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
function dayValue(_field: PluginStorageField, value: unknown): string {
  const match = DAY.exec(stringValue(value));
  if (!match) throw new Error('must be a day such as "2026-03-31"');
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(0);
  probe.setUTCFullYear(year, month - 1, day);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    throw new Error('must be a real calendar day');
  }
  return match[0];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function uuidValue(_field: PluginStorageField, value: unknown): string {
  const text = stringValue(value);
  if (!UUID.test(text)) throw new Error('must be a lowercase canonical uuid');
  return text;
}

function jsonValue(_field: PluginStorageField, value: unknown): unknown {
  const text = value === undefined ? undefined : JSON.stringify(value);
  if (text === undefined) throw new Error('must be a JSON value');
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
  if (integerDigits > (field.precision ?? 38) - scale) throw new Error(`exceeds precision ${field.precision}`);
  return formatDecimal(scaled(parsed, scale), scale);
}

function compareDecimals(a: unknown, b: unknown): number {
  const left = parseDecimal(a);
  const right = parseDecimal(b);
  const scale = Math.max(left.frac.length, right.frac.length);
  return cmp(scaled(left, scale), scaled(right, scale));
}

const HANDLERS: Record<PluginStorageFieldType, TypeHandler> = {
  string: { normalize: boundedString, compare: cmp, clone: identity },
  text: { normalize: (_f, value) => stringValue(value), compare: cmp, clone: identity },
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
  uuid: { normalize: uuidValue, compare: cmp, clone: identity },
};

/**
 * Normalizes a value written to or filtered on a field. `label` names the field in the error. Null is allowed only
 * for nullable fields (and never in filters, which use `isNull`).
 */
export function normalizeValue(label: string, field: PluginStorageField, value: unknown, lenient = false): unknown {
  if (value === null) {
    if (field.nullable && !lenient) return null;
    throw new PluginStorageInvalid(`${label} must not be null.`);
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

export function isComparable(field: PluginStorageField): boolean {
  return HANDLERS[field.type].compare !== undefined;
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
