import type { CompiledField } from '../../../plugin-system/plugin-storage/storage-model';
import { postgresStorageDialect } from './postgres-storage-dialect';

const field = (overrides: Partial<CompiledField> & Pick<CompiledField, 'type'>): CompiledField => ({
  name: 'value',
  column: 'value',
  nullable: true,
  hasDefault: false,
  generated: false,
  ...overrides,
});

describe('postgresStorageDialect', () => {
  const { encode, decode } = postgresStorageDialect;

  it('quotes identifiers and doubles embedded quotes', () => {
    expect(postgresStorageDialect.quote('items')).toBe('"items"');
    expect(postgresStorageDialect.quote('we"ird')).toBe('"we""ird"');
  });

  it('uses numbered markers, widening integer filter operands to bigint', () => {
    expect(postgresStorageDialect.placeholder(3)).toBe('$3');
    expect(postgresStorageDialect.placeholder(3, field({ type: 'string' }))).toBe('$3');
    expect(postgresStorageDialect.placeholder(3, field({ type: 'integer' }))).toBe('$3::bigint');
  });

  describe('encode', () => {
    it('stores null and undefined as null', () => {
      expect(encode(field({ type: 'string' }), null)).toBeNull();
      expect(encode(field({ type: 'boolean' }), undefined)).toBeNull();
    });

    it('passes booleans, timestamps, decimals and numbers to the driver as they are', () => {
      const instant = new Date('2026-01-02T03:04:05.006Z');
      expect(encode(field({ type: 'boolean' }), true)).toBe(true);
      expect(encode(field({ type: 'timestamp' }), instant)).toBe(instant);
      expect(encode(field({ type: 'decimal', precision: 10, scale: 2 }), '12.50')).toBe('12.50');
      expect(encode(field({ type: 'integer' }), 7)).toBe(7);
    });

    it('stores JSON as text for the jsonb column', () => {
      expect(encode(field({ type: 'json' }), { a: [1] })).toBe('{"a":[1]}');
      expect(encode(field({ type: 'json' }), 'x')).toBe('"x"');
    });

    it('keeps a real day and maps a day that does not exist to infinity, which no row holds', () => {
      expect(encode(field({ type: 'date' }), '2026-02-28')).toBe('2026-02-28');
      expect(encode(field({ type: 'date' }), '2024-02-29')).toBe('2024-02-29');
      expect(encode(field({ type: 'date' }), '2026-02-30')).toBe('infinity');
      expect(encode(field({ type: 'date' }), '2026-13-01')).toBe('infinity');
    });

    it('keeps a well-formed UUID and maps a malformed one to null (it equals no row)', () => {
      expect(encode(field({ type: 'uuid' }), '3f2504e0-4f89-41d3-9a0c-0305e82c3302')).toBe(
        '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      );
      expect(encode(field({ type: 'uuid' }), 'not-a-uuid')).toBeNull();
    });
  });

  describe('decode', () => {
    it('reads null and undefined as null', () => {
      expect(decode(field({ type: 'string' }), null)).toBeNull();
      expect(decode(field({ type: 'json' }), undefined)).toBeNull();
    });

    it('reads integers (also the text of a bigint)', () => {
      expect(decode(field({ type: 'integer' }), '12')).toBe(12);
      expect(decode(field({ type: 'integer' }), 12)).toBe(12);
    });

    it.each([
      [true, true],
      ['t', true],
      ['true', true],
      [false, false],
      ['f', false],
    ])('reads the boolean %j as %j', (stored, expected) => {
      expect(decode(field({ type: 'boolean' }), stored)).toBe(expected);
    });

    it('reads timestamps as the instant, from a Date or from text', () => {
      const instant = new Date('2026-01-02T03:04:05.006Z');
      expect(decode(field({ type: 'timestamp' }), instant)).toBe(instant);
      expect(decode(field({ type: 'timestamp' }), '2026-01-02 03:04:05.006+00')).toEqual(instant);
      expect(decode(field({ type: 'timestamp' }), 'garbage')).toBeNull();
    });

    it('reads numeric text with exactly the scale', () => {
      const decimal = field({ type: 'decimal', precision: 10, scale: 2 });
      expect(decode(decimal, '12.50')).toBe('12.50');
      expect(decode(decimal, '-0.05')).toBe('-0.05');
      expect(decode(decimal, '7')).toBe('7.00');
      expect(decode(field({ type: 'decimal', precision: 5, scale: 0 }), '42')).toBe('42');
    });

    it('keeps the parsed value of a jsonb column and parses text', () => {
      expect(decode(field({ type: 'json' }), { a: [1] })).toEqual({ a: [1] });
      expect(decode(field({ type: 'json' }), '{"a":[1]}')).toEqual({ a: [1] });
    });

    it('reads a date as its day: the driver hands over local midnight, or text', () => {
      expect(decode(field({ type: 'date' }), new Date(2026, 0, 2))).toBe('2026-01-02');
      expect(decode(field({ type: 'date' }), '2026-01-02')).toBe('2026-01-02');
    });

    it('reads text types as strings', () => {
      expect(decode(field({ type: 'string' }), 'abc')).toBe('abc');
      expect(decode(field({ type: 'text' }), 5)).toBe('5');
      expect(decode(field({ type: 'uuid' }), 'u')).toBe('u');
    });
  });

  describe('syntax', () => {
    it('limits and offsets in either combination', () => {
      expect(postgresStorageDialect.limit(undefined, undefined)).toBe('');
      expect(postgresStorageDialect.limit(5, undefined)).toBe('LIMIT 5');
      expect(postgresStorageDialect.limit(5, 0)).toBe('LIMIT 5');
      expect(postgresStorageDialect.limit(5, 2)).toBe('LIMIT 5 OFFSET 2');
      expect(postgresStorageDialect.limit(undefined, 2)).toBe('OFFSET 2');
    });

    it('tests prefixes case-sensitively with starts_with and orders nulls lowest', () => {
      expect(postgresStorageDialect.startsWith('"c"', '$1', 3)).toBe('starts_with("c", $1)');
      expect(postgresStorageDialect.orderTerm('"c"', 'asc')).toBe('"c" ASC NULLS FIRST');
      expect(postgresStorageDialect.orderTerm('"c"', 'desc')).toBe('"c" DESC NULLS LAST');
    });

    it('reports generated keys with RETURNING and binds at most 65535 parameters', () => {
      expect(postgresStorageDialect.returning('"id"')).toBe(' RETURNING "id"');
      expect(postgresStorageDialect.maxParameters).toBe(65_535);
    });
  });
});
