import { ENROLLMENT_CODE_ALPHABET, generateEnrollmentCode, normalizeEnrollmentCode } from './enrollment-code';

describe('enrollment codes', () => {
  it('uses 6 characters of the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateEnrollmentCode()).toMatch(new RegExp(`^[${ENROLLMENT_CODE_ALPHABET}]{6}$`));
    }
  });

  it('retries while a code is taken', () => {
    let calls = 0;
    generateEnrollmentCode(() => ++calls < 5);
    expect(calls).toBe(5);
  });

  it('ignores case, spaces and the hyphen', () => {
    expect(normalizeEnrollmentCode(' k7p-3xq ')).toBe('K7P3XQ');
    expect(normalizeEnrollmentCode('K7P3XQ')).toBe('K7P3XQ');
  });

  it('rejects ambiguous characters and wrong lengths', () => {
    expect(normalizeEnrollmentCode('K7P-3X0')).toBeNull();
    expect(normalizeEnrollmentCode('K7P-3X')).toBeNull();
    expect(normalizeEnrollmentCode('')).toBeNull();
  });
});
