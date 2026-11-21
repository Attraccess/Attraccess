/**
 * Value conversion from a SQLite cell to a PostgreSQL parameter, by the PostgreSQL column type (read from the
 * catalog). An error names the place (table, row key, column), never the stored value.
 */

/** One SQLite cell as the import reads it: the value, its storage class and, for numbers, SQLite's exact text form. */
export interface SqliteCell {
  readonly value: unknown;
  readonly storage: 'null' | 'integer' | 'real' | 'text' | 'blob';
  /** CAST(value AS TEXT) for integers and reals: integers beyond 2^53 and decimals never pass through a double. */
  readonly exact: string | null;
}

/** A stored (non generated) column of a core table: its name and information_schema data type. */
export interface PostgresColumn {
  readonly name: string;
  readonly dataType: string;
}

export class SqliteImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SqliteImportError';
  }
}

const INSTANT = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INTEGER = /^-?\d+$/;

/**
 * SQLite stores instants as text, with or without milliseconds and offset. Text without an offset is UTC, which is
 * how the application and `datetime('now')` wrote them. Returns ISO-8601 UTC, or null when the text is not an instant.
 */
export function parseInstant(stored: string): string | null {
  const match = INSTANT.exec(stored.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second, fraction = '', zone] = match;
  // PostgreSQL keeps microseconds; anything finer would be rounded silently.
  if (fraction.length > 6) return null;
  const millis = Number(fraction.slice(0, 3).padEnd(3, '0'));
  let epoch = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second, millis);
  // Date.UTC rolls 2026-13-45 over into a later date; a stored value that is not a real instant must not.
  const check = new Date(epoch);
  if (
    check.getUTCFullYear() !== +year ||
    check.getUTCMonth() !== +month - 1 ||
    check.getUTCDate() !== +day ||
    check.getUTCHours() !== +hour ||
    check.getUTCMinutes() !== +minute ||
    check.getUTCSeconds() !== +second
  ) {
    return null;
  }
  if (zone && zone.toUpperCase() !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    epoch -= sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2))) * 60_000;
  }
  const iso = new Date(epoch).toISOString();
  // Keep sub-millisecond digits as written: PostgreSQL stores microseconds.
  return fraction.length > 3 ? iso.replace(/\.\d{3}Z$/, `.${fraction.padEnd(6, '0')}Z`) : iso;
}

/** The text of a number cell exactly as SQLite holds it, or the text cell itself. */
function numberText(cell: SqliteCell): string | null {
  if (cell.storage === 'integer' || cell.storage === 'real') return cell.exact;
  if (cell.storage === 'text') return String(cell.value).trim();
  return null;
}

type Converter = (cell: SqliteCell) => unknown;

function toBoolean(cell: SqliteCell): boolean {
  if (cell.storage === 'integer' && (cell.exact === '0' || cell.exact === '1')) return cell.exact === '1';
  throw new Error('is not a boolean (0 or 1)');
}

function toInstant(cell: SqliteCell): string {
  const instant = cell.storage === 'text' ? parseInstant(String(cell.value)) : null;
  if (instant === null) throw new Error('is not an instant');
  return instant;
}

function toDate(cell: SqliteCell): string {
  const text = cell.storage === 'text' ? String(cell.value).trim() : '';
  if (DATE.test(text) && parseInstant(`${text} 00:00:00`) !== null) return text;
  throw new Error('is not a date');
}

function toInteger(cell: SqliteCell): string {
  const text = numberText(cell);
  if (text !== null && INTEGER.test(text)) return text;
  // A whole number stored as REAL (1.0) is still that integer.
  if (cell.storage === 'real' && Number.isInteger(cell.value)) return String(cell.value);
  throw new Error('is not an integer');
}

function toDecimal(cell: SqliteCell): string {
  const text = numberText(cell);
  if (text !== null && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return text;
  throw new Error('is not a decimal number');
}

function toDouble(cell: SqliteCell): string {
  const text = numberText(cell);
  if (text !== null && text !== '' && Number.isFinite(Number(text))) return text;
  throw new Error('is not a number');
}

function toJson(cell: SqliteCell): string {
  const text = cell.storage === 'blob' ? null : (numberText(cell) ?? String(cell.value));
  try {
    if (text !== null) {
      JSON.parse(text);
      return text;
    }
  } catch {
    // falls through to the refusal
  }
  throw new Error('is not a JSON document');
}

function toBytes(cell: SqliteCell): Buffer {
  if (cell.storage === 'blob') return Buffer.from(cell.value as Uint8Array);
  if (cell.storage === 'text') return Buffer.from(String(cell.value), 'utf8');
  throw new Error('is not binary data');
}

/** Conversions by information_schema data type. */
const CONVERTERS: Readonly<Record<string, Converter>> = {
  boolean: toBoolean,
  'timestamp with time zone': toInstant,
  'timestamp without time zone': toInstant,
  date: toDate,
  smallint: toInteger,
  integer: toInteger,
  bigint: toInteger,
  numeric: toDecimal,
  'double precision': toDouble,
  real: toDouble,
  json: toJson,
  jsonb: toJson,
  bytea: toBytes,
};

/** text, character varying, uuid and enum types (USER-DEFINED): PostgreSQL parses the text. */
function toText(cell: SqliteCell, dataType: string): unknown {
  if (cell.storage === 'text') return cell.value;
  if (cell.storage === 'integer' || cell.storage === 'real') return cell.exact;
  throw new Error(`cannot be stored as ${dataType}`);
}

/**
 * The PostgreSQL parameter for one SQLite cell, chosen by the column's PostgreSQL data type. Throws a message
 * fragment (without the value) when the cell cannot be stored there; the caller adds the place.
 */
export function toPostgresValue(column: PostgresColumn, cell: SqliteCell): unknown {
  if (cell.storage === 'null' || cell.value === null || cell.value === undefined) return null;
  const convert = CONVERTERS[column.dataType];
  return convert ? convert(cell) : toText(cell, column.dataType);
}

/** The placeholder of one parameter: json documents are sent as text and cast, everything else PostgreSQL infers. */
export function placeholder(index: number, column: PostgresColumn): string {
  return column.dataType === 'json' || column.dataType === 'jsonb' ? `$${index}::${column.dataType}` : `$${index}`;
}
