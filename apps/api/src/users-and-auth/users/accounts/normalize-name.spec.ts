import { normalizeUserName, toStorableUserName, userNameProblem } from './normalize-name';

describe('normalizeUserName', () => {
  it('trims and turns blanks into null', () => {
    expect(normalizeUserName('  Ada ')).toBe('Ada');
    expect(normalizeUserName('   ')).toBeNull();
    expect(normalizeUserName('')).toBeNull();
    expect(normalizeUserName(null)).toBeNull();
    expect(normalizeUserName(undefined)).toBeNull();
  });

  describe('userNameProblem', () => {
    it('accepts 100 characters, counting a character outside the BMP once', () => {
      expect(userNameProblem('x'.repeat(100))).toBeNull();
      expect(userNameProblem('😀'.repeat(100))).toBeNull();
    });

    it('refuses more than 100 characters', () => {
      expect(userNameProblem('x'.repeat(101))).toBe('TOO_LONG');
    });

    it.each([
      ['NUL', 'a\u0000'],
      ['a tab', 'Ada\tLovelace'],
      ['a line break', 'Ada\n'],
      ['escape', '\u001b[31m'],
    ])('refuses %s', (_name, value) => {
      expect(userNameProblem(value)).toBe('INVALID');
    });
  });

  describe('toStorableUserName', () => {
    it('removes control characters and trims', () => {
      expect(toStorableUserName(' A\u0000da\u0007 ')).toBe('Ada');
      expect(toStorableUserName('\u0000 \n')).toBeNull();
    });

    it('cuts to 100 code points without splitting a surrogate pair', () => {
      expect(toStorableUserName('x' + '😀'.repeat(150))).toBe('x' + '😀'.repeat(99));
    });

    it('trims again after cutting, so the stored value normalizes to itself', () => {
      const name = toStorableUserName(`${'x'.repeat(99)}  tail`);
      expect(name).toBe('x'.repeat(99));
      expect(normalizeUserName(name)).toBe(name);
    });
  });
});
