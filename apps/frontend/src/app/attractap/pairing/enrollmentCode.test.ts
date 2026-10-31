import { describe, expect, it } from 'vitest';
import { enrollmentCodeFromScan, formatEnrollmentCode, normalizeEnrollmentCode } from './enrollmentCode';

describe('enrollment codes', () => {
  it.each([
    ['K7P-3XQ', 'K7P3XQ'],
    [' k7p 3xq ', 'K7P3XQ'],
    ['k7p3xq', 'K7P3XQ'],
  ])('normalises %j', (input, code) => {
    expect(normalizeEnrollmentCode(input)).toBe(code);
  });

  it.each(['', 'K7P3X', 'K7P3XQ9', 'K7P3X0', 'K7P3X1', 'K7P3XI', 'K7P3XL', 'K7P3XO', 'K7P_3XQ'])(
    'rejects %j',
    (input) => {
      expect(normalizeEnrollmentCode(input)).toBeNull();
    },
  );

  it('formats a code the way devices show it', () => {
    expect(formatEnrollmentCode('K7P3XQ')).toBe('K7P-3XQ');
  });

  it.each([
    ['K7P-3XQ', 'K7P3XQ'],
    ['https://attraccess.example.com/?enroll=k7p-3xq', 'K7P3XQ'],
    ['https://attraccess.example.com/resources', null],
    ['https://attraccess.example.com/?enroll=nope', null],
    ['not a code', null],
  ])('reads %j from a scan', (rawValue, code) => {
    expect(enrollmentCodeFromScan(rawValue)).toBe(code);
  });
});
