import type { CompiledField } from '../../../plugin-system/plugin-storage/storage-model';
import { formatSqliteTimestamp, parseSqliteTimestamp, sqliteStorageDialect } from './sqlite-storage-dialect';

const field = (overrides: Partial<CompiledField> & Pick<CompiledField, 'type'>): CompiledField => ({
  name: 'value',
  column: 'value',
  nullable: true,
  hasDefault: false,
  generated: false,
  ...overrides,
});

describe('formatSqliteTimestamp', () => {
  it('writes UTC text with milliseconds, zero padded', () => {
    expect(formatSqliteTimestamp(new Date('2026-01-02T03:04:05.006Z'))).toBe('2026-01-02 03:04:05.006');
    expect(formatSqliteTimestamp(new Date('0099-12-31T23:59:59.999Z'))).toBe('0099-12-31 23:59:59.999');
  });
});

describe('parseSqliteTimestamp', () => {
  const instant = new Date('2026-01-02T03:04:05.678Z');

  it.each([
    ['TypeORM text with milliseconds', '2026-01-02 03:04:05.678'],
    ['TypeORM text with seconds', '2026-01-02 03:04:05', new Date('2026-01-02T03:04:05.000Z')],
    ['TypeORM text with minutes only', '2026-01-02 03:04', new Date('2026-01-02T03:04:00.000Z')],
    ['ISO text with a zone', '2026-01-02T03:04:05.678Z'],
    ['ISO text with an offset', '2026-01-02T04:04:05.678+01:00'],
    ['ISO text without a zone (UTC)', '2026-01-02T03:04:05.678'],
    ['epoch milliseconds', instant.getTime()],
    ['a Date', instant],
  ])('reads %s', (_label, stored, expected = instant) => {
    expect(parseSqliteTimestamp(stored)).toEqual(expected);
  });

  it('keeps the Date it was given', () => {
    expect(parseSqliteTimestamp(instant)).toBe(instant);
  });

  it.each([['not a date'], [''], [{}], [true], [undefined], [null]])('returns null for %j', (stored) => {
    expect(parseSqliteTimestamp(stored)).toBeNull();
  });
});

describe('sqliteStorageDialect', () => {
  const { encode, decode } = sqliteStorageDialect;

  it('quotes identifiers and doubles embedded quotes', () => {
    expect(sqliteStorageDialect.quote('items')).toBe('"items"');
    expect(sqliteStorageDialect.quote('we"ird')).toBe('"we""ird"');
  });

  it('uses positional markers', () => {
    expect(sqliteStorageDialect.placeholder(3)).toBe('?');
  });

  describe('encode', () => {
    it('stores null and undefined as null', () => {
      expect(encode(field({ type: 'string' }), null)).toBeNull();
      expect(encode(field({ type: 'boolean' }), undefined)).toBeNull();
    });

    it('stores booleans as 0 and 1', () => {
      expect(encode(field({ type: 'boolean' }), true)).toBe(1);
      expect(encode(field({ type: 'boolean' }), false)).toBe(0);
    });

    it('stores timestamps as UTC text', () => {
      expect(encode(field({ type: 'timestamp' }), new Date('2026-01-02T03:04:05.006Z'))).toBe(
        '2026-01-02 03:04:05.006',
      );
    });

    it('stores decimals as scaled integers', () => {
      const decimal = field({ type: 'decimal', precision: 10, scale: 2 });
      expect(encode(decimal, '12.50')).toBe(1250);
      expect(encode(decimal, '-0.05')).toBe(-5);
      expect(encode(decimal, '7.00')).toBe(700);
      expect(encode(field({ type: 'decimal', precision: 5, scale: 0 }), '42')).toBe(42);
      expect(encode(field({ type: 'decimal' }), '42')).toBe(42);
    });

    it('stores JSON as text', () => {
      expect(encode(field({ type: 'json' }), { a: [1] })).toBe('{"a":[1]}');
      expect(encode(field({ type: 'json' }), 'x')).toBe('"x"');
    });

    it('passes every other type through', () => {
      expect(encode(field({ type: 'string' }), 'abc')).toBe('abc');
      expect(encode(field({ type: 'integer' }), 7)).toBe(7);
      expect(encode(field({ type: 'date' }), '2026-01-02')).toBe('2026-01-02');
      expect(encode(field({ type: 'uuid' }), 'u')).toBe('u');
      expect(encode(field({ type: 'text' }), 't')).toBe('t');
    });
  });

  describe('decode', () => {
    it('reads null and undefined as null', () => {
      expect(decode(field({ type: 'string' }), null)).toBeNull();
      expect(decode(field({ type: 'json' }), undefined)).toBeNull();
    });

    it('reads integers', () => {
      expect(decode(field({ type: 'integer' }), '12')).toBe(12);
      expect(decode(field({ type: 'integer' }), 12)).toBe(12);
    });

    it.each([
      [1, true],
      [true, true],
      ['1', true],
      ['true', true],
      [0, false],
      [false, false],
      ['0', false],
      ['false', false],
    ])('reads the boolean %j as %j', (stored, expected) => {
      expect(decode(field({ type: 'boolean' }), stored)).toBe(expected);
    });

    it('reads timestamps in every stored form', () => {
      expect(decode(field({ type: 'timestamp' }), '2026-01-02 03:04:05.006')).toEqual(
        new Date('2026-01-02T03:04:05.006Z'),
      );
      expect(decode(field({ type: 'timestamp' }), 'garbage')).toBeNull();
    });

    it('reads scaled decimals', () => {
      const decimal = field({ type: 'decimal', precision: 10, scale: 2 });
      expect(decode(decimal, 1250)).toBe('12.50');
      expect(decode(decimal, '1250')).toBe('12.50');
      expect(decode(decimal, -5)).toBe('-0.05');
      expect(decode(decimal, 0)).toBe('0.00');
      expect(decode(field({ type: 'decimal', precision: 5, scale: 0 }), 42)).toBe('42');
      expect(decode(field({ type: 'decimal' }), -42)).toBe('-42');
    });

    it('parses JSON text and keeps values the driver already parsed', () => {
      expect(decode(field({ type: 'json' }), '{"a":[1]}')).toEqual({ a: [1] });
      expect(decode(field({ type: 'json' }), { a: 1 })).toEqual({ a: 1 });
    });

    it('cuts a date to its day', () => {
      expect(decode(field({ type: 'date' }), '2026-01-02 00:00:00')).toBe('2026-01-02');
      expect(decode(field({ type: 'date' }), '2026-01-02')).toBe('2026-01-02');
    });

    it('reads text types as strings', () => {
      expect(decode(field({ type: 'string' }), 'abc')).toBe('abc');
      expect(decode(field({ type: 'text' }), 5)).toBe('5');
      expect(decode(field({ type: 'uuid' }), 'u')).toBe('u');
    });
  });

  describe('syntax', () => {
    it('limits with an offset only after a limit', () => {
      expect(sqliteStorageDialect.limit(undefined, undefined)).toBe('');
      expect(sqliteStorageDialect.limit(5, undefined)).toBe('LIMIT 5');
      expect(sqliteStorageDialect.limit(5, 0)).toBe('LIMIT 5');
      expect(sqliteStorageDialect.limit(5, 2)).toBe('LIMIT 5 OFFSET 2');
      expect(sqliteStorageDialect.limit(undefined, 2)).toBe('LIMIT -1 OFFSET 2');
    });

    it('tests prefixes with substr and orders nulls lowest', () => {
      expect(sqliteStorageDialect.startsWith('"c"', '?', 3)).toBe('substr("c", 1, 3) = ?');
      expect(sqliteStorageDialect.orderTerm('"c"', 'asc')).toBe('"c" ASC NULLS FIRST');
      expect(sqliteStorageDialect.orderTerm('"c"', 'desc')).toBe('"c" DESC NULLS LAST');
    });
  });
});
