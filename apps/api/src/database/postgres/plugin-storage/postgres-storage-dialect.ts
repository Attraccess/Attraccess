import type { PluginStorageDialect } from '../../../plugin-system/plugin-storage/storage-dialect.port';
import type { CompiledField } from '../../../plugin-system/plugin-storage/storage-model';

type FieldType = CompiledField['type'];
type Codec = (field: CompiledField, value: unknown) => unknown;

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** A `date` column read by node-postgres is a Date at local midnight; its local parts are the stored day. */
function dayOf(stored: unknown): string {
  if (stored instanceof Date) {
    return `${pad(stored.getFullYear(), 4)}-${pad(stored.getMonth() + 1)}-${pad(stored.getDate())}`;
  }
  return String(stored).slice(0, 10);
}

/** A `timestamptz` as node-postgres reads it (a Date), or as text when a driver option turns the parsing off. */
function instantOf(stored: unknown): Date | null {
  if (stored instanceof Date) return stored;
  if (typeof stored !== 'string' && typeof stored !== 'number') return null;
  const parsed = new Date(stored);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `numeric(p, s)` is returned with exactly `s` fraction digits; this keeps that form for any text the driver gives. */
function decimalOf(field: CompiledField, stored: unknown): string {
  const scale = field.scale ?? 0;
  const text = String(stored);
  const [whole, fraction = ''] = text.split('.');
  return scale === 0 ? whole : `${whole}.${fraction.padEnd(scale, '0').slice(0, scale)}`;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A filter operand may be a day that does not exist ("2026-02-30"). The host never stores `infinity`, so it stands for
 * "a date no row has": `=` and `IN` match nothing, `<>` and `NOT IN` match every row with a date.
 */
function dayParameter(value: unknown): unknown {
  const match = typeof value === 'string' ? DAY.exec(value) : null;
  if (!match) return value;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(2000, month - 1, day));
  probe.setUTCFullYear(year);
  const real = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  return real ? value : 'infinity';
}

/** A malformed UUID operand (a filter may carry one) is NULL: it equals no row. */
const uuidParameter = (value: unknown): unknown => (typeof value === 'string' && UUID.test(value) ? value : null);

const ENCODERS: Partial<Record<FieldType, Codec>> = {
  json: (_field, value) => JSON.stringify(value),
  date: (_field, value) => dayParameter(value),
  uuid: (_field, value) => uuidParameter(value),
};

const DECODERS: Partial<Record<FieldType, Codec>> = {
  integer: (_field, stored) => Number(stored),
  boolean: (_field, stored) => stored === true || stored === 't' || stored === 'true' || stored === 1,
  timestamp: (_field, stored) => instantOf(stored),
  decimal: decimalOf,
  json: (_field, stored) => (typeof stored === 'string' ? JSON.parse(stored) : stored),
  date: (_field, stored) => dayOf(stored),
};

/** PostgreSQL allows 65535 bind parameters per statement (the protocol's 16-bit count). */
const POSTGRES_MAX_PARAMETERS = 65_535;

/**
 * PostgreSQL value representation of plugin storage: decimals are `numeric(p, s)` (exact; the driver hands them over
 * as text), timestamps are `timestamptz` (UTC instants), dates `date`, JSON `jsonb`, UUIDs `uuid`, booleans native.
 * Values are bound as parameters; the column types make the server read the text forms.
 */
export const postgresStorageDialect: PluginStorageDialect = {
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  // An integer filter value may exceed the 32-bit column: compare as bigint instead of failing on the range.
  placeholder: (position, field) => (field?.type === 'integer' ? `$${position}::bigint` : `$${position}`),
  encode(field: CompiledField, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    const encoder = ENCODERS[field.type];
    return encoder ? encoder(field, value) : value;
  },
  decode(field: CompiledField, stored: unknown): unknown {
    if (stored === null || stored === undefined) return null;
    const decoder = DECODERS[field.type];
    return decoder ? decoder(field, stored) : String(stored);
  },
  limit(limit, offset) {
    if (limit === undefined && offset === undefined) return '';
    return `${limit === undefined ? '' : `LIMIT ${limit}`}${offset ? `${limit === undefined ? '' : ' '}OFFSET ${offset}` : ''}`;
  },
  // starts_with compares exactly (no collation folding, no LIKE wildcards in the prefix) and counts characters.
  startsWith: (column, placeholder) => `starts_with(${column}, ${placeholder})`,
  // PostgreSQL sorts NULL as the highest value by default; the neutral order wants it lowest.
  orderTerm: (column, direction) => `${column} ${direction === 'asc' ? 'ASC NULLS FIRST' : 'DESC NULLS LAST'}`,
  returning: (column) => ` RETURNING ${column}`,
  maxParameters: POSTGRES_MAX_PARAMETERS,
};
