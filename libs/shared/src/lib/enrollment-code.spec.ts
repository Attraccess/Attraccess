import {
  ENROLLMENT_CODE_ALPHABET,
  ENROLLMENT_CODE_LENGTH,
  formatEnrollmentCode,
  normalizeEnrollmentCode,
} from './enrollment-code';

describe('enrollment codes', () => {
  it('uses 6 characters without 0, 1, I, L and O', () => {
    expect(ENROLLMENT_CODE_LENGTH).toBe(6);
    expect(ENROLLMENT_CODE_ALPHABET).toHaveLength(31);
    for (const ambiguous of '01ILO') expect(ENROLLMENT_CODE_ALPHABET).not.toContain(ambiguous);
  });

  it.each([
    [' k7p-3xq ', 'K7P3XQ'],
    ['K7P3XQ', 'K7P3XQ'],
    ['k7p 3xq', 'K7P3XQ'],
  ])('ignores case, spaces and the hyphen in %j', (input, code) => {
    expect(normalizeEnrollmentCode(input)).toBe(code);
  });

  it.each(['', 'K7P-3X', 'K7P3XQ9', 'K7P-3X0', 'K7P3X1', 'K7P3XI', 'K7P3XL', 'K7P3XO', 'K7P_3XQ'])(
    'rejects %j',
    (input) => {
      expect(normalizeEnrollmentCode(input)).toBeNull();
    },
  );

  it('formats a code the way devices show it', () => {
    expect(formatEnrollmentCode('K7P3XQ')).toBe('K7P-3XQ');
  });
});
