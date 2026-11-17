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

function checkJson(field: CompiledField, label: string | undefined, value: unknown, depth: number): void {
  if (depth > MAX_JSON_DEPTH) invalid(field, label, 'JSON nested too deeply');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) invalid(field, label, 'JSON numbers must be finite');
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) checkJson(field, label, item, depth + 1);
    return;
  }
  const prototype = typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (typeof value === 'object' && (prototype === null || Object.getPrototypeOf(prototype) === null)) {
    for (const item of Object.values(value as Record<string, unknown>)) checkJson(field, label, item, depth + 1);
    return;
  }
  invalid(field, label, 'only plain JSON values (objects, arrays, strings, finite numbers, booleans) are stored');
}

/** Digits of a decimal string normalised to exactly `scale` fraction digits; throws when it does not fit. */
export function normalizeDecimal(field: CompiledField, label: string | undefined, value: string): string {
  const match = DECIMAL_PATTERN.exec(value);
  const precision = field.precision ?? MAX_DECIMAL_PRECISION;
  const scale = field.scale ?? 0;
  if (!match) return invalid(field, label, 'a decimal is a string such as "12.50"');
  const [, sign, whole, fraction = ''] = match;
  if (fraction.length > scale) invalid(field, label, `at most ${scale} fraction digits (no silent rounding)`);
  const integerDigits = whole.replace(/^0+(?=\d)/, '');
  if (integerDigits !== '0' && integerDigits.length > precision - scale) invalid(field, label, `at most ${precision - scale} integer digits`);
  const text = `${integerDigits}${scale > 0 ? `.${fraction.padEnd(scale, '0')}` : ''}`;
  return sign && /[1-9]/.test(text) ? `-${text}` : text;
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
  switch (field.type) {
    case 'string': {
      if (typeof value !== 'string') return invalid(field, label, 'expected a string');
      const limit = field.length ?? DEFAULT_STRING_LENGTH;
      if (value.length > limit) invalid(field, label, `longer than ${limit} characters (use a text field)`);
      return value;
    }
    case 'text':
      return typeof value === 'string' ? value : invalid(field, label, 'expected a string');
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value) ? value : invalid(field, label, 'expected a safe integer');
    case 'decimal':
      return typeof value === 'string' ? normalizeDecimal(field, label, value) : invalid(field, label, 'expected a decimal string');
    case 'boolean':
      return typeof value === 'boolean' ? value : invalid(field, label, 'expected a boolean');
    case 'timestamp':
      return value instanceof Date && !Number.isNaN(value.getTime())
        ? new Date(value.getTime())
        : invalid(field, label, 'expected a valid Date');
    case 'date': {
      const match = typeof value === 'string' ? DATE_PATTERN.exec(value) : null;
      if (!match) return invalid(field, label, 'expected "YYYY-MM-DD"');
      const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return day.toISOString().startsWith(value as string) ? value : invalid(field, label, 'not a calendar day');
    }
    case 'json': {
      if (value === undefined) return invalid(field, label, 'undefined is not JSON');
      checkJson(field, label, value, 0);
      const text = JSON.stringify(value);
      if (text.length > MAX_JSON_BYTES) invalid(field, label, `larger than ${MAX_JSON_BYTES} bytes`);
      return JSON.parse(text);
    }
    case 'uuid': {
      const lowered = typeof value === 'string' ? value.toLowerCase() : '';
      return UUID_PATTERN.test(lowered) ? lowered : invalid(field, label, 'expected a UUID');
    }
    default:
      return invalid(field, label, 'unknown field type');
  }
}

/** Whether `value` is allowed in a filter for the field's type (equality, ordering and prefix operators). */
export function isOrderable(field: CompiledField): boolean {
  return field.type !== 'json' && field.type !== 'boolean';
}
