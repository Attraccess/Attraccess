import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import type { CompiledField } from './storage-model';

/**
 * Value rules of the neutral field types. A value is validated and brought into its canonical JavaScript form before
 * it is stored or compared, so every backend sees the same values: exact decimals as fixed-scale strings, timestamps
 * as UTC Dates with millisecond precision, JSON as a plain deep copy, UUIDs in lowercase.
 */

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 64;
export const DEFAULT_STRING_LENGTH = 255;
/** Decimals are exact up to this many digits; wider values would not survive a JavaScript number round trip. */
export const MAX_DECIMAL_PRECISION = 15;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DECIMAL_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;

const describe = (field: CompiledField, label?: string): string => `${label ?? field.name} (${field.type})`;

function invalid(field: CompiledField, label: string | undefined, reason: string): never {
  throw new PluginStorageInvalid(`Invalid value for ${describe(field, label)}: ${reason}.`);
}

const isPlainJsonObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

/** The nested values of an array or plain object; undefined for anything else. */
function jsonChildren(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  return isPlainJsonObject(value) ? Object.values(value) : undefined;
}

function checkJson(field: CompiledField, label: string | undefined, value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) invalid(field, label, 'JSON nested too deeply');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(field, label, 'JSON numbers must be finite');
    return;
  }
  const children = jsonChildren(value);
  if (!children) {
    invalid(field, label, 'only plain JSON values (objects, arrays, strings, finite numbers, booleans) are stored');
  }
  for (const child of children) checkJson(field, label, child, depth + 1);
}

/** Digits of a decimal string normalised to exactly `scale` fraction digits; throws when it does not fit. */
export function normalizeDecimal(field: CompiledField, label: string | undefined, value: string): string {
  const match = DECIMAL_PATTERN.exec(value);
  if (!match) return invalid(field, label, 'a decimal is a string such as "12.50"');
  const precision = field.precision ?? MAX_DECIMAL_PRECISION;
  const scale = field.scale ?? 0;
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > scale) invalid(field, label, `at most ${scale} fraction digits (no silent rounding)`);
  const integerDigits = whole.replace(/^0+(?=\d)/, '');
  if (integerDigits !== '0' && integerDigits.length > precision - scale)
    invalid(field, label, `at most ${precision - scale} integer digits`);
  const text = `${integerDigits}${scale > 0 ? `.${fraction.padEnd(scale, '0')}` : ''}`;
  return sign && /[1-9]/.test(text) ? `-${text}` : text;
}

type Normalizer = (field: CompiledField, value: unknown, label: string | undefined) => unknown;

const NORMALIZERS = new Map<string, Normalizer>([
  [
    'string',
    (field, value, label) => {
      if (typeof value !== 'string') return invalid(field, label, 'expected a string');
      const limit = field.length ?? DEFAULT_STRING_LENGTH;
      if (value.length > limit) invalid(field, label, `longer than ${limit} characters (use a text field)`);
      return value;
    },
  ],
  ['text', (field, value, label) => (typeof value === 'string' ? value : invalid(field, label, 'expected a string'))],
  [
    'integer',
    (field, value, label) =>
      typeof value === 'number' && Number.isSafeInteger(value)
        ? value
        : invalid(field, label, 'expected a safe integer'),
  ],
  [
    'decimal',
    (field, value, label) =>
      typeof value === 'string'
        ? normalizeDecimal(field, label, value)
        : invalid(field, label, 'expected a decimal string'),
  ],
  [
    'boolean',
    (field, value, label) => (typeof value === 'boolean' ? value : invalid(field, label, 'expected a boolean')),
  ],
  [
    'timestamp',
    (field, value, label) =>
      value instanceof Date && !Number.isNaN(value.getTime())
        ? new Date(value.getTime())
        : invalid(field, label, 'expected a valid Date'),
  ],
  ['date', normalizeDate],
  ['json', normalizeJson],
  [
    'uuid',
    (field, value, label) => {
      const lowered = typeof value === 'string' ? value.toLowerCase() : '';
      return UUID_PATTERN.test(lowered) ? lowered : invalid(field, label, 'expected a UUID');
    },
  ],
]);

function normalizeDate(field: CompiledField, value: unknown, label: string | undefined): unknown {
  const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
  if (!match) return invalid(field, label, 'expected "YYYY-MM-DD"');
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.toISOString().startsWith(value as string) ? value : invalid(field, label, 'not a calendar day');
}

function normalizeJson(field: CompiledField, value: unknown, label: string | undefined): unknown {
  if (value === undefined) return invalid(field, label, 'undefined is not JSON');
  checkJson(field, label, value, 0);
  const text = JSON.stringify(value);
  if (text.length > MAX_JSON_BYTES) invalid(field, label, `larger than ${MAX_JSON_BYTES} bytes`);
  return JSON.parse(text);
}

/**
 * The canonical form of `value` for `field`. `null` is accepted for nullable fields only. Throws
 * PluginStorageInvalid for anything the field cannot hold.
 */
export function normalizeValue(field: CompiledField, value: unknown, label?: string): unknown {
  if (value === null) {
    if (!field.nullable) invalid(field, label, 'the field is required');
    return null;
  }
  const normalize = NORMALIZERS.get(field.type);
  return normalize ? normalize(field, value, label) : invalid(field, label, 'unknown field type');
}

/** Whether the field's type has an order: comparisons, `between` and `orderBy` (not JSON, not boolean). */
export function isOrderable(field: CompiledField): boolean {
  return field.type !== 'json' && field.type !== 'boolean';
}

/** A filter operand in canonical form. `exact` is false for a decimal no stored value can equal; `value` is then
 * the largest value of the field's scale below it. */
export interface FilterOperand {
  readonly value: unknown;
  readonly exact: boolean;
}

/** A decimal string rounded down to `scale` fraction digits, with whether that lost a non-zero digit. */
function floorDecimal(value: string, scale: number): FilterOperand {
  const [, sign, whole, fraction = ''] = DECIMAL_PATTERN.exec(value) as RegExpExecArray;
  const kept = BigInt(`${whole}${fraction.slice(0, scale).padEnd(scale, '0')}`);
  const exact = !/[1-9]/.test(fraction.slice(scale));
  const floor = sign ? -kept - (exact ? BigInt(0) : BigInt(1)) : kept;
  const digits = (floor < 0 ? -floor : floor).toString().padStart(scale + 1, '0');
  const text = scale > 0 ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits;
  return { value: floor < 0 ? `-${text}` : text, exact };
}

type FilterNormalizer = (field: CompiledField, value: unknown) => FilterOperand | undefined;

const exactly = (value: unknown): FilterOperand => ({ value, exact: true });

/** Type checks of filter operands; undefined when the value has the wrong type. */
const FILTER_NORMALIZERS = new Map<string, FilterNormalizer>([
  ['string', (_field, value) => (typeof value === 'string' ? exactly(value) : undefined)],
  ['text', (_field, value) => (typeof value === 'string' ? exactly(value) : undefined)],
  ['uuid', (_field, value) => (typeof value === 'string' ? exactly(value.toLowerCase()) : undefined)],
  ['date', (_field, value) => (typeof value === 'string' && DATE_PATTERN.test(value) ? exactly(value) : undefined)],
  [
    'decimal',
    (field, value) =>
      typeof value === 'string' && DECIMAL_PATTERN.test(value) ? floorDecimal(value, field.scale ?? 0) : undefined,
  ],
]);

/**
 * The canonical form of a filter operand. Only the type and form are checked (a string, a safe integer, a decimal
 * string, a valid Date, a "YYYY-MM-DD" day, a boolean), never the limits of the column: a longer string, a decimal
 * with more places than the scale, a day that does not exist or a malformed UUID is a valid operand that matches
 * what an exact comparison with it matches (usually nothing). `null` is not an operand: use `isNull`.
 */
export function normalizeFilterValue(field: CompiledField, value: unknown, operator: string): FilterOperand {
  if (value === null) {
    throw new PluginStorageInvalid(`"${operator}" on "${field.name}" takes no null; use isNull, or "or" with isNull.`);
  }
  const special = FILTER_NORMALIZERS.get(field.type);
  if (!special) return exactly(normalizeValue({ ...field, nullable: false }, value));
  const operand = special(field, value);
  if (!operand) invalid(field, undefined, `"${operator}" takes a ${field.type} value`);
  return operand;
}
