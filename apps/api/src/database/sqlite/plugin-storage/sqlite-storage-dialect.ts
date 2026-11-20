import type { PluginStorageDialect } from '../../../plugin-system/plugin-storage/storage-dialect.port';
import type { CompiledField } from '../../../plugin-system/plugin-storage/storage-model';

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** `YYYY-MM-DD HH:MM:SS.mmm` in UTC: the text form TypeORM writes into SQLite `datetime` columns. */
export function formatSqliteTimestamp(value: Date): string {
  return (
    `${pad(value.getUTCFullYear(), 4)}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ` +
    `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}.${pad(value.getUTCMilliseconds(), 3)}`
  );
}

/** Reads the stored forms of a timestamp: TypeORM text (UTC, no zone), ISO text, epoch milliseconds. */
export function parseSqliteTimestamp(stored: unknown): Date | null {
  if (stored instanceof Date) return stored;
  if (typeof stored === 'number') return new Date(stored);
  if (typeof stored !== 'string') return null;
  const parsed = new Date(withZone(stored));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Text without a zone is UTC: TypeORM's `YYYY-MM-DD HH:MM[:SS[.mmm]]` becomes ISO with a `Z`. */
function withZone(text: string): string {
  const iso = /^\d\d\d\d-\d\d-\d\d \d\d:\d\d/.test(text) ? text.replace(' ', 'T') : text;
  return /^\d\d\d\d-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(iso) ? `${iso}Z` : iso;
}

/** A decimal string as the integer of its digits (`"12.50"` at scale 2 is 1250). Exact: decimals have at most 15 digits. */
function toScaled(value: string, scale: number): number {
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const scaled = Number(`${whole}${fraction.padEnd(scale, '0')}`);
  return negative ? -scaled : scaled;
}

function fromScaled(value: number, scale: number): string {
  const digits = String(Math.abs(value)).padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return value < 0 ? `-${text}` : text;
}

type FieldType = CompiledField['type'];
type Codec = (field: CompiledField, value: unknown) => unknown;

const ENCODERS: Partial<Record<FieldType, Codec>> = {
  boolean: (_field, value) => (value ? 1 : 0),
  timestamp: (_field, value) => formatSqliteTimestamp(value as Date),
  decimal: (field, value) => toScaled(value as string, field.scale ?? 0),
  json: (_field, value) => JSON.stringify(value),
};

const DECODERS: Partial<Record<FieldType, Codec>> = {
  integer: (_field, stored) => Number(stored),
  boolean: (_field, stored) => stored === 1 || stored === true || stored === '1' || stored === 'true',
  timestamp: (_field, stored) => parseSqliteTimestamp(stored),
  decimal: (field, stored) => fromScaled(Number(stored), field.scale ?? 0),
  json: (_field, stored) => (typeof stored === 'string' ? JSON.parse(stored) : stored),
  date: (_field, stored) => String(stored).slice(0, 10),
};

/**
 * A string or text column. A BLOB in it (an adopted 1.x binary column declared as text, such as Matter's backup
 * file) reads as base64: the neutral schema has no binary type, and UTF-8 decoding would corrupt the bytes.
 */
function decodeText(stored: unknown): string {
  if (stored instanceof Uint8Array)
    return Buffer.from(stored.buffer, stored.byteOffset, stored.byteLength).toString('base64');
  return String(stored);
}

/** SQLite's default SQLITE_MAX_VARIABLE_NUMBER (since 3.32). */
const SQLITE_MAX_PARAMETERS = 32_766;

/**
 * SQLite value representation of plugin storage: decimals are scaled integers (exact, ordered and summable),
 * timestamps are UTC text in TypeORM's `datetime` form, booleans are 0/1, JSON is text. Adopted 1.x tables hold the
 * same forms, so their rows read unchanged.
 */
export const sqliteStorageDialect: PluginStorageDialect = {
  quote: (identifier) => `"${identifier.replace(/"/g, '""')}"`,
  placeholder: () => '?',
  encode(field: CompiledField, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    const encoder = ENCODERS[field.type];
    return encoder ? encoder(field, value) : value;
  },
  decode(field: CompiledField, stored: unknown): unknown {
    if (stored === null || stored === undefined) return null;
    const decoder = DECODERS[field.type];
    return decoder ? decoder(field, stored) : decodeText(stored);
  },
  limit(limit, offset) {
    if (limit === undefined && offset === undefined) return '';
    // SQLite needs a LIMIT before an OFFSET; -1 is "no limit".
    return `LIMIT ${limit ?? -1}${offset ? ` OFFSET ${offset}` : ''}`;
  },
  // substr compares exactly (LIKE ignores ASCII case) and needs no escaping of the prefix. It counts characters
  // (code points), so `prefixLength` is the prefix's code point count.
  startsWith: (column, placeholder, prefixLength) => `substr(${column}, 1, ${prefixLength}) = ${placeholder}`,
  orderTerm: (column, direction) => `${column} ${direction === 'asc' ? 'ASC NULLS FIRST' : 'DESC NULLS LAST'}`,
  // The executor reads the generated key from the statement's last row id.
  returning: () => '',
  maxParameters: SQLITE_MAX_PARAMETERS,
};
