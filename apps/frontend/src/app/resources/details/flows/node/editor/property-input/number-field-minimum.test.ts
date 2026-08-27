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
});
