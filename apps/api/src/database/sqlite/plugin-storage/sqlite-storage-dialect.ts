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
  let text = stored;
  if (/^\d\d\d\d-\d\d-\d\d \d\d:\d\d/.test(text)) text = text.replace(' ', 'T');
  if (/^\d\d\d\d-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?$/.test(text)) text += 'Z';
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
    switch (field.type) {
      case 'boolean':
        return value ? 1 : 0;
      case 'timestamp':
        return formatSqliteTimestamp(value as Date);
      case 'decimal':
        return toScaled(value as string, field.scale ?? 0);
      case 'json':
        return JSON.stringify(value);
      default:
        return value;
    }
  },
  decode(field: CompiledField, stored: unknown): unknown {
    if (stored === null || stored === undefined) return null;
    switch (field.type) {
      case 'integer':
        return Number(stored);
      case 'boolean':
        return stored === 1 || stored === true || stored === '1' || stored === 'true';
      case 'timestamp':
        return parseSqliteTimestamp(stored);
      case 'decimal':
        return fromScaled(Number(stored), field.scale ?? 0);
      case 'json':
        return typeof stored === 'string' ? JSON.parse(stored) : stored;
      case 'date':
        return String(stored).slice(0, 10);
      default:
        return String(stored);
    }
  },
  limit(limit, offset) {
    if (limit === undefined && offset === undefined) return '';
    // SQLite needs a LIMIT before an OFFSET; -1 is "no limit".
    return `LIMIT ${limit ?? -1}${offset ? ` OFFSET ${offset}` : ''}`;
  },
  // substr compares exactly (LIKE ignores ASCII case) and needs no escaping of the prefix.
  startsWith: (column, placeholder, prefixLength) => `substr(${column}, 1, ${prefixLength}) = ${placeholder}`,
  orderTerm: (column, direction) => `${column} ${direction === 'asc' ? 'ASC NULLS FIRST' : 'DESC NULLS LAST'}`,
};
