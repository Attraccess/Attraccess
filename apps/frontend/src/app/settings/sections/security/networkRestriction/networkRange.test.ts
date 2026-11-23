import { describe, expect, it } from 'vitest';
import { isValidRange, splitRangeInput } from './networkRange';

describe('isValidRange', () => {
  it.each(['10.0.0.0/8', '192.168.1.5', '::1/128', 'fc00::/7', '2001:db8::1', '255.255.255.255/32'])(
    'accepts %s',
    (entry) => expect(isValidRange(entry)).toBe(true),
  );
  it.each(['', 'nope', '10.0.0.0/33', '10.0.0.256', '::1/129', '10.0.0.0/8/1', '1.2.3', 'fc00::/-1', 'g::1'])(
    'rejects %s',
    (entry) => expect(isValidRange(entry)).toBe(false),
  );
});

describe('splitRangeInput', () => {
  it('splits on commas, semicolons and whitespace', () => {
    expect(splitRangeInput('10.0.0.0/8, fc00::/7;\n::1/128  ')).toEqual(['10.0.0.0/8', 'fc00::/7', '::1/128']);
  });
});
