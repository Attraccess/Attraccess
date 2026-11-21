import { parseInstant, placeholder, toPostgresValue, type SqliteCell } from './sqlite-values';

const text = (value: string): SqliteCell => ({ value, storage: 'text', exact: null });
const integer = (exact: string): SqliteCell => ({ value: Number(exact), storage: 'integer', exact });
const real = (value: number, exact = String(value)): SqliteCell => ({ value, storage: 'real', exact });
const blob = (bytes: number[]): SqliteCell => ({ value: Buffer.from(bytes), storage: 'blob', exact: null });
const column = (dataType: string) => ({ name: 'c', dataType });

describe('parseInstant', () => {
  it.each([
    ['2026-01-02 03:04:05', '2026-01-02T03:04:05.000Z'],
    ['2026-01-02T03:04:05.678Z', '2026-01-02T03:04:05.678Z'],
    ['2026-01-02 03:04:05.5', '2026-01-02T03:04:05.500Z'],
    ['2026-01-02T03:04:05+02:00', '2026-01-02T01:04:05.000Z'],
    ['2026-01-02 03:04:05 -0130', '2026-01-02T04:34:05.000Z'],
    ['2026-01-02 03:04:05.123456', '2026-01-02T03:04:05.123456Z'],
  ])('reads %s as UTC unless it has an offset', (stored, iso) => {
    expect(parseInstant(stored)).toBe(iso);
  });

  it.each([
    'yesterday',
    '2026-13-01 00:00:00',
    '2026-02-30 00:00:00',
    '2026-01-02 25:00:00',
    '2026-01-02 03:04:05.1234567',
  ])('refuses %s', (stored) => {
    expect(parseInstant(stored)).toBeNull();
  });
});

describe('toPostgresValue', () => {
  it('passes null through for every type', () => {
    expect(toPostgresValue(column('boolean'), { value: null, storage: 'null', exact: null })).toBeNull();
  });

  it('reads booleans from 0 and 1 only', () => {
    expect(toPostgresValue(column('boolean'), integer('1'))).toBe(true);
    expect(toPostgresValue(column('boolean'), integer('0'))).toBe(false);
    expect(() => toPostgresValue(column('boolean'), integer('2'))).toThrow('is not a boolean');
    expect(() => toPostgresValue(column('boolean'), text('true'))).toThrow('is not a boolean');
  });

  it('reads instants and dates from text', () => {
    expect(toPostgresValue(column('timestamp with time zone'), text('2026-01-02 03:04:05'))).toBe(
      '2026-01-02T03:04:05.000Z',
    );
    expect(() => toPostgresValue(column('timestamp with time zone'), integer('1700000000'))).toThrow(
      'is not an instant',
    );
    expect(toPostgresValue(column('date'), text('2026-02-28'))).toBe('2026-02-28');
    expect(() => toPostgresValue(column('date'), text('2026-02-30'))).toThrow('is not a date');
  });

  it('keeps integers and decimals exact, never through a double', () => {
    expect(toPostgresValue(column('bigint'), integer('9223372036854775807'))).toBe('9223372036854775807');
    expect(toPostgresValue(column('integer'), real(3))).toBe('3');
    expect(() => toPostgresValue(column('integer'), real(76.04))).toThrow('is not an integer');
    expect(toPostgresValue(column('numeric'), text('123456789012345678901234567890.123456789'))).toBe(
      '123456789012345678901234567890.123456789',
    );
    expect(toPostgresValue(column('numeric'), real(1000.000000001, '1000.000000001'))).toBe('1000.000000001');
    expect(() => toPostgresValue(column('numeric'), text('a lot'))).toThrow('is not a decimal number');
  });

  it('accepts a REAL from an integer-typed SQLite column where PostgreSQL has double precision', () => {
    expect(toPostgresValue(column('double precision'), real(76.0425))).toBe('76.0425');
    expect(toPostgresValue(column('double precision'), integer('-12'))).toBe('-12');
    expect(() => toPostgresValue(column('double precision'), text('far left'))).toThrow('is not a number');
  });

  it('checks JSON documents and sends them as text', () => {
    expect(toPostgresValue(column('jsonb'), text('{"a":[1,2]}'))).toBe('{"a":[1,2]}');
    expect(toPostgresValue(column('json'), integer('5'))).toBe('5');
    expect(() => toPostgresValue(column('jsonb'), text('{broken'))).toThrow('is not a JSON document');
    expect(placeholder(3, column('jsonb'))).toBe('$3::jsonb');
    expect(placeholder(3, column('text'))).toBe('$3');
  });

  it('copies blobs as bytes', () => {
    expect(toPostgresValue(column('bytea'), blob([0, 255, 7]))).toEqual(Buffer.from([0, 255, 7]));
    expect(toPostgresValue(column('bytea'), text('ab'))).toEqual(Buffer.from('ab'));
  });

  it('stores text, enum and number cells as text, but refuses a blob in a text column', () => {
    expect(toPostgresValue(column('USER-DEFINED'), text('machine'))).toBe('machine');
    expect(toPostgresValue(column('character varying'), real(1000.000000001, '1000.000000001'))).toBe('1000.000000001');
    expect(() => toPostgresValue(column('text'), blob([1]))).toThrow('cannot be stored as text');
  });
});
