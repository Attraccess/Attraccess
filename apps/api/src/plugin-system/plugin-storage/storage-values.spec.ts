import { PluginStorageInvalid } from '@attraccess/plugins-backend-sdk';
import type { CompiledField } from './storage-model';
import { isOrderable, normalizeDecimal, normalizeValue } from './storage-values';

const field = (overrides: Partial<CompiledField> & Pick<CompiledField, 'type'>): CompiledField => ({
  name: 'value',
  column: 'value',
  nullable: false,
  hasDefault: false,
  generated: false,
  ...overrides,
});

const rejects = (target: CompiledField, value: unknown, message: RegExp) => {
  expect(() => normalizeValue(target, value)).toThrow(PluginStorageInvalid);
  expect(() => normalizeValue(target, value)).toThrow(message);
};

describe('normalizeValue', () => {
  it('accepts null for nullable fields only', () => {
    expect(normalizeValue(field({ type: 'text', nullable: true }), null)).toBeNull();
    rejects(field({ type: 'text' }), null, /the field is required/);
  });

  it('names the field, its type and the given label in the error', () => {
    expect(() => normalizeValue(field({ type: 'text' }), 1, 'items.name')).toThrow(
      'Invalid value for items.name (text): expected a string.',
    );
    expect(() => normalizeValue(field({ type: 'text' }), 1)).toThrow('Invalid value for value (text)');
  });

  it('rejects an unknown field type', () => {
    rejects(field({ type: 'mystery' as never }), 'x', /unknown field type/);
  });

  describe('string and text', () => {
    it('keeps strings up to the length of the field', () => {
      expect(normalizeValue(field({ type: 'string', length: 3 }), 'abc')).toBe('abc');
      rejects(field({ type: 'string', length: 3 }), 'abcd', /longer than 3 characters/);
    });

    it('defaults the string length to 255', () => {
      expect(normalizeValue(field({ type: 'string' }), 'x'.repeat(255))).toHaveLength(255);
      rejects(field({ type: 'string' }), 'x'.repeat(256), /longer than 255/);
    });

    it('rejects values that are not strings', () => {
      rejects(field({ type: 'string' }), 1, /expected a string/);
      rejects(field({ type: 'text' }), {}, /expected a string/);
      expect(normalizeValue(field({ type: 'text' }), 'long '.repeat(100))).toHaveLength(500);
    });
  });

  describe('integer and boolean', () => {
    it('accepts safe integers only', () => {
      expect(normalizeValue(field({ type: 'integer' }), -7)).toBe(-7);
      rejects(field({ type: 'integer' }), 1.5, /safe integer/);
      rejects(field({ type: 'integer' }), Number.MAX_SAFE_INTEGER + 1, /safe integer/);
      rejects(field({ type: 'integer' }), '1', /safe integer/);
    });

    it('accepts booleans only', () => {
      expect(normalizeValue(field({ type: 'boolean' }), false)).toBe(false);
      rejects(field({ type: 'boolean' }), 0, /expected a boolean/);
    });
  });

  describe('timestamp', () => {
    it('returns an independent copy of a valid Date', () => {
      const given = new Date('2026-01-02T03:04:05.678Z');
      const result = normalizeValue(field({ type: 'timestamp' }), given) as Date;
      expect(result).toEqual(given);
      expect(result).not.toBe(given);
    });

    it('rejects invalid dates and other types', () => {
      rejects(field({ type: 'timestamp' }), new Date('nope'), /valid Date/);
      rejects(field({ type: 'timestamp' }), '2026-01-02T03:04:05Z', /valid Date/);
    });
  });

  describe('date', () => {
    it('accepts a calendar day', () => {
      expect(normalizeValue(field({ type: 'date' }), '2024-02-29')).toBe('2024-02-29');
    });

    it('rejects other shapes and impossible days', () => {
      rejects(field({ type: 'date' }), '2024-2-29', /YYYY-MM-DD/);
      rejects(field({ type: 'date' }), 20240229, /YYYY-MM-DD/);
      rejects(field({ type: 'date' }), '2023-02-29', /not a calendar day/);
      rejects(field({ type: 'date' }), '2024-13-01', /not a calendar day/);
    });
  });

  describe('uuid', () => {
    it('lowercases a UUID', () => {
      expect(normalizeValue(field({ type: 'uuid' }), '3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(
        '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
      );
    });

    it('rejects anything else', () => {
      rejects(field({ type: 'uuid' }), 'not-a-uuid', /expected a UUID/);
      rejects(field({ type: 'uuid' }), 42, /expected a UUID/);
    });
  });

  describe('decimal', () => {
    const money = field({ type: 'decimal', precision: 6, scale: 2 });

    it('needs a string', () => {
      rejects(money, 12.5, /expected a decimal string/);
    });

    it('normalises to a fixed scale', () => {
      expect(normalizeValue(money, '12.5')).toBe('12.50');
      expect(normalizeValue(money, '007')).toBe('7.00');
      expect(normalizeValue(money, '-0.10')).toBe('-0.10');
    });
  });

  describe('json', () => {
    const json = field({ type: 'json' });

    it('returns a deep copy of plain JSON', () => {
      const given = { a: [1, 'two', null, true], b: { c: 2.5 } };
      const copy = normalizeValue(json, given);
      expect(copy).toEqual(given);
      expect(copy).not.toBe(given);
      expect((copy as typeof given).a).not.toBe(given.a);
    });

    it('accepts scalars and objects without a prototype', () => {
      expect(normalizeValue(json, 'text')).toBe('text');
      expect(normalizeValue(json, false)).toBe(false);
      expect(normalizeValue(json, Object.assign(Object.create(null), { a: 1 }))).toEqual({ a: 1 });
    });

    it('rejects undefined, non-finite numbers and values JSON cannot hold', () => {
      rejects(json, undefined, /undefined is not JSON/);
      rejects(json, Number.NaN, /must be finite/);
      rejects(json, { nested: [Infinity] }, /must be finite/);
      rejects(json, new Date(), /only plain JSON values/);
      rejects(json, new (class Custom {})(), /only plain JSON values/);
      rejects(json, { fn: () => 1 }, /only plain JSON values/);
      rejects(json, [1n], /only plain JSON values/);
      rejects(json, Symbol('x'), /only plain JSON values/);
    });

    it('rejects values nested too deeply', () => {
      const nest = (depth: number): unknown => (depth === 0 ? 1 : [nest(depth - 1)]);
      expect(() => normalizeValue(json, nest(64))).not.toThrow();
      rejects(json, nest(66), /nested too deeply/);
    });

    it('rejects documents larger than one mebibyte', () => {
      rejects(json, 'x'.repeat(1024 * 1024), /larger than 1048576 bytes/);
    });
  });
});

describe('normalizeDecimal', () => {
  const decimal = (precision: number, scale: number) => field({ type: 'decimal', precision, scale });

  it.each([
    ['12.5', 10, 2, '12.50'],
    ['0', 10, 2, '0.00'],
    ['0012.345', 10, 3, '12.345'],
    ['5', 3, 0, '5'],
    ['-1.5', 10, 2, '-1.50'],
    ['-0', 10, 2, '0.00'],
    ['-0.00', 10, 2, '0.00'],
    ['99999999', 10, 2, '99999999.00'],
  ])('normalises %s at (%i, %i) to %s', (value, precision, scale, expected) => {
    expect(normalizeDecimal(decimal(precision, scale), undefined, value)).toBe(expected);
  });

  it('falls back to the widest precision and scale 0 without declarations', () => {
    expect(normalizeDecimal(field({ type: 'decimal' }), undefined, '123456789012345')).toBe('123456789012345');
    expect(() => normalizeDecimal(field({ type: 'decimal' }), undefined, '1234567890123456')).toThrow(
      /at most 15 integer digits/,
    );
  });

  it.each(['', 'abc', '1.', '.5', '1,5', ' 1', '1e3', '+1'])('rejects the malformed decimal %j', (value) => {
    expect(() => normalizeDecimal(decimal(10, 2), 'price', value)).toThrow(/a decimal is a string such as "12.50"/);
  });

  it('refuses silent rounding', () => {
    expect(() => normalizeDecimal(decimal(10, 2), undefined, '1.005')).toThrow(/at most 2 fraction digits/);
    expect(() => normalizeDecimal(decimal(10, 0), undefined, '1.0')).toThrow(/at most 0 fraction digits/);
  });

  it('refuses values with too many integer digits', () => {
    expect(() => normalizeDecimal(decimal(5, 2), undefined, '1000')).toThrow(/at most 3 integer digits/);
    expect(normalizeDecimal(decimal(5, 2), undefined, '999')).toBe('999.00');
  });
});

describe('isOrderable', () => {
  it.each([
    ['string', true],
    ['integer', true],
    ['decimal', true],
    ['timestamp', true],
    ['date', true],
    ['uuid', true],
    ['json', false],
    ['boolean', false],
  ] as const)('%s fields: %s', (type, expected) => {
    expect(isOrderable(field({ type }))).toBe(expected);
  });
});
