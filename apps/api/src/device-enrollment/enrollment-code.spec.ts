import { ENROLLMENT_CODE_ALPHABET, generateEnrollmentCode, normalizeEnrollmentCode } from './enrollment-code';

// Normalisation and formatting are tested with the shared code in libs/shared.
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

  it('generates codes that survive normalisation unchanged', () => {
    const code = generateEnrollmentCode();
    expect(normalizeEnrollmentCode(code)).toBe(code);
  });
});
