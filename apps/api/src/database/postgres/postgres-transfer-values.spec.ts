import type { CompiledField } from '../../plugin-system/plugin-storage/storage-model';
import type { SnapshotColumnKind } from '../transfer-snapshot';
import {
  bindValue,
  exportValue,
  kindOfPgType,
  placeholder,
  selectExpression,
  type ColumnPlan,
} from './postgres-transfer-values';

const plan = (kind: SnapshotColumnKind, pgType = 'text', field?: CompiledField): ColumnPlan => ({
  name: 'c',
  kind,
  pgType,
  field,
});

describe('postgres transfer values', () => {
  describe('kindOfPgType', () => {
    it.each([
      ['smallint', 'integer'],
      ['integer', 'integer'],
      ['bigint', 'integer'],
      ['boolean', 'boolean'],
      ['timestamp with time zone', 'timestamp'],
      ['timestamp without time zone', 'timestamp'],
      ['double precision', 'real'],
      ['real', 'real'],
      ['bytea', 'blob'],
      ['date', 'date'],
      ['numeric', 'decimal'],
      ['text', 'text'],
      ['character varying', 'text'],
      ['jsonb', 'text'],
    ])('maps %s to %s', (pgType, kind) => expect(kindOfPgType(pgType)).toBe(kind));
  });

  describe('selectExpression', () => {
    it('reads integers and decimals as text and quotes the identifier', () => {
      expect(selectExpression('a"b', plan('integer'))).toBe('"a""b"::text');
      expect(selectExpression('a', plan('decimal'))).toBe('"a"::text');
    });

    it('formats timestamps as UTC ISO text and dates as plain dates', () => {
      expect(selectExpression('t', plan('timestamp'))).toContain(`AT TIME ZONE 'UTC'`);
      expect(selectExpression('d', plan('date'))).toBe(`to_char("d", 'YYYY-MM-DD')`);
    });

    it('casts json documents to text and leaves other text alone', () => {
      expect(selectExpression('j', plan('text', 'json'))).toBe('"j"::text');
      expect(selectExpression('j', plan('text', 'jsonb'))).toBe('"j"::text');
      expect(selectExpression('s', plan('text', 'text'))).toBe('"s"');
    });

    it('reads booleans, reals and blobs as they are', () => {
      for (const kind of ['boolean', 'real', 'blob'] as const) expect(selectExpression('x', plan(kind))).toBe('"x"');
    });
  });

  describe('exportValue', () => {
    it('keeps null and undefined as null for every kind', () => {
      expect(exportValue(plan('integer'), null, 'w')).toBeNull();
      expect(exportValue(plan('text'), undefined, 'w')).toBeNull();
    });

    it('exports safe integers as numbers and larger ones as digits', () => {
      expect(exportValue(plan('integer'), '42', 'w')).toBe(42);
      expect(exportValue(plan('integer'), '9007199254740993', 'w')).toEqual({ integer: '9007199254740993' });
    });

    it('exports decimals, dates and timestamps as strings', () => {
      expect(exportValue(plan('decimal'), '12.50', 'w')).toBe('12.50');
      expect(exportValue(plan('date'), '2026-01-02', 'w')).toBe('2026-01-02');
      expect(exportValue(plan('timestamp'), '2026-01-02T03:04:05.000Z', 'w')).toBe('2026-01-02T03:04:05.000Z');
    });

    it('exports booleans, reals and blobs', () => {
      expect(exportValue(plan('boolean'), true, 'w')).toBe(true);
      expect(exportValue(plan('boolean'), false, 'w')).toBe(false);
      expect(exportValue(plan('real'), '1.5', 'w')).toBe(1.5);
      expect(exportValue(plan('blob'), Buffer.from('hi'), 'w')).toEqual({ blob: Buffer.from('hi').toString('base64') });
    });

    it('exports text and refuses a non-text value in a text column without quoting it', () => {
      expect(exportValue(plan('text'), 'abc', 'w')).toBe('abc');
      expect(() => exportValue(plan('text'), 12345, 't[0].c')).toThrow('t[0].c: unsupported number value');
      expect(() => exportValue(plan('text'), 12345, 't[0].c')).not.toThrow(/12345/);
    });
  });

  describe('bindValue', () => {
    const decimalField = { type: 'decimal', column: 'c', precision: 6, scale: 2 } as unknown as CompiledField;

    it('keeps null', () => expect(bindValue(plan('integer'), null, 'w')).toBeNull());

    it('binds booleans and refuses other values', () => {
      expect(bindValue(plan('boolean'), true, 'w')).toBe(true);
      expect(() => bindValue(plan('boolean'), 'yes', 'w')).toThrow('w: yes is not a boolean');
    });

    it('binds integers, also the digit form', () => {
      expect(bindValue(plan('integer'), 5, 'w')).toBe(5);
      expect(bindValue(plan('integer'), { integer: '9007199254740993' }, 'w')).toBe('9007199254740993');
    });

    it('binds ISO instants and refuses anything else', () => {
      expect(bindValue(plan('timestamp'), '2026-01-02T03:04:05.123Z', 'w')).toBe('2026-01-02T03:04:05.123Z');
      expect(bindValue(plan('timestamp'), '2026-01-02T03:04:05Z', 'w')).toBe('2026-01-02T03:04:05Z');
      expect(() => bindValue(plan('timestamp'), '2026-01-02 03:04:05', 'w')).toThrow(/not an ISO-8601 UTC instant/);
      expect(() => bindValue(plan('timestamp'), 5, 'w')).toThrow(/not an ISO-8601 UTC instant/);
    });

    it('binds blobs as bytes', () => {
      expect(bindValue(plan('blob'), { blob: Buffer.from('hi').toString('base64') }, 'w')).toEqual(Buffer.from('hi'));
    });

    it('binds dates and refuses malformed ones', () => {
      expect(bindValue(plan('date'), '2026-01-02', 'w')).toBe('2026-01-02');
      expect(() => bindValue(plan('date'), '02.01.2026', 'w')).toThrow(/is not a date/);
      expect(() => bindValue(plan('date'), 7, 'w')).toThrow(/is not a date/);
    });

    it('binds decimals: as is without a declaration, normalised with one, refused when malformed', () => {
      expect(bindValue(plan('decimal'), '12.5', 'w')).toBe('12.5');
      expect(bindValue(plan('decimal', 'numeric', decimalField), '12.5', 'w')).toBe('12.50');
      expect(() => bindValue(plan('decimal'), 12, 'w')).toThrow(/is not a decimal/);
      expect(() => bindValue(plan('decimal', 'numeric', decimalField), 'abc', 'w')).toThrow(/^w: /);
    });

    it('passes real and text values through', () => {
      expect(bindValue(plan('real'), 1.5, 'w')).toBe(1.5);
      expect(bindValue(plan('text'), 'x', 'w')).toBe('x');
    });
  });

  describe('placeholder', () => {
    it('casts json documents and leaves others bare', () => {
      expect(placeholder(3, plan('text', 'jsonb'))).toBe('$3::jsonb');
      expect(placeholder(1, plan('text', 'json'))).toBe('$1::json');
      expect(placeholder(2, plan('text'))).toBe('$2');
    });
  });
});
