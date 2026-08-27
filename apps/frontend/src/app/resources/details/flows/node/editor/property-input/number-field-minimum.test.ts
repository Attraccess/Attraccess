import { describe, expect, it } from 'vitest';
import { getNumberFieldMinimum } from './number-field-minimum';

describe('getNumberFieldMinimum', () => {
  it('returns the first global multiple above an exclusive bound', () => {
    expect(getNumberFieldMinimum({ type: 'number', exclusiveMinimum: 5, multipleOf: 2 })).toBe(6);
  });

  it('handles decimal exclusive bounds and multiples without accumulating floating-point offsets', () => {
    expect(getNumberFieldMinimum({ type: 'number', exclusiveMinimum: 0.5, multipleOf: 0.2 })).toBe(0.6);
    expect(getNumberFieldMinimum({ type: 'number', exclusiveMinimum: 0.1, multipleOf: 0.01 })).toBe(0.11);
  });

  it('keeps integer exclusive minima on the next integer when no multiple is specified', () => {
    expect(getNumberFieldMinimum({ type: 'integer', exclusiveMinimum: 5 })).toBe(6);
  });

  it('returns an integer that satisfies fractional multipleOf values', () => {
    expect(getNumberFieldMinimum({ type: 'integer', exclusiveMinimum: 1, multipleOf: 0.3 })).toBe(3);
    expect(getNumberFieldMinimum({ type: 'integer', exclusiveMinimum: 1, multipleOf: 0.5 })).toBe(2);
  });

  it('does not round a high-precision increment back to the exclusive bound', () => {
    const exclusiveMinimum = Number('0.12345678901234567');
    const minimum = getNumberFieldMinimum({ type: 'number', exclusiveMinimum, multipleOf: 0.00000000000000001 });

    expect(minimum).toBeGreaterThan(exclusiveMinimum);
  });

  it('keeps a decimal multiple when its first conversion rounds to the exclusive bound', () => {
    const exclusiveMinimum = 10000000000000002;
    const minimum = getNumberFieldMinimum({ type: 'number', exclusiveMinimum, multipleOf: 0.3 });

    expect(minimum).toBeGreaterThan(exclusiveMinimum);
  });

  it('advances integer multiples that round to the exclusive bound', () => {
    expect(getNumberFieldMinimum({ type: 'integer', exclusiveMinimum: 9007199254740992, multipleOf: 1 }))
      .toBe(9007199254740994);
  });
});
