import { DEFAULT_PASSWORD_POLICY, PasswordPolicyConfig } from './types';
import { validatePassword } from './validate-password';

const policy = (overrides: Partial<PasswordPolicyConfig> = {}): PasswordPolicyConfig => ({
  ...DEFAULT_PASSWORD_POLICY,
  ...overrides,
});

describe('validatePassword', () => {
  it('accepts a strong password under defaults', () => {
    const result = validatePassword('correct-horse-battery-staple-42', policy());
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  describe('length checks', () => {
    it('rejects too short', () => {
      const result = validatePassword('short1!', policy({ minLength: 12 }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'MIN_LENGTH', params: { min: 12, actual: 7 } });
    });

    it('rejects too long', () => {
      const result = validatePassword('a'.repeat(200), policy({ maxLength: 128 }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual({ code: 'MAX_LENGTH', params: { max: 128, actual: 200 } });
    });

    it('accepts exact min length', () => {
      const result = validatePassword('a'.repeat(12), policy({ minLength: 12 }));
      expect(result.errors.some((e) => e.code === 'MIN_LENGTH')).toBe(false);
    });
  });

  describe('character class checks', () => {
    it('requires uppercase when enabled', () => {
      const result = validatePassword('alllowercase123456', policy({ requireUppercase: true }));
      expect(result.errors).toContainEqual({ code: 'MISSING_UPPER', params: {} });
    });

    it('requires lowercase when enabled', () => {
      const result = validatePassword('ALLUPPERCASE123456', policy({ requireLowercase: true }));
      expect(result.errors).toContainEqual({ code: 'MISSING_LOWER', params: {} });
    });

    it('requires digit when enabled', () => {
      const result = validatePassword('NoDigitsAtAllHere', policy({ requireDigit: true }));
      expect(result.errors).toContainEqual({ code: 'MISSING_DIGIT', params: {} });
    });

    it('requires special when enabled', () => {
      const result = validatePassword('NoSpecial123Chars', policy({ requireSpecial: true }));
      expect(result.errors).toContainEqual({ code: 'MISSING_SPECIAL', params: {} });
    });

    it('accepts when all class requirements satisfied', () => {
      const result = validatePassword(
        'Aa1!aaaaaaaaaa',
        policy({ requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: true }),
      );
      expect(result.ok).toBe(true);
    });

    it('accepts unicode uppercase/lowercase/digits when allowed', () => {
      const result = validatePassword(
        'Über-Kraftwerk-2025-Ω',
        policy({ requireUppercase: true, requireLowercase: true, requireDigit: true, requireSpecial: true }),
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('unicode allow-all', () => {
    it('rejects non-ASCII when allowAllUnicode false', () => {
      const result = validatePassword('Üpperase-password-123', policy({ allowAllUnicode: false }));
      expect(result.errors).toContainEqual({ code: 'DISALLOWED_CHARACTER', params: {} });
    });

    it('allows non-ASCII when allowAllUnicode true', () => {
      const result = validatePassword('Üpperase-password-123', policy({ allowAllUnicode: true }));
      expect(result.errors.some((e) => e.code === 'DISALLOWED_CHARACTER')).toBe(false);
    });
  });

  describe('similarity to identifiers', () => {
    it('rejects password containing username (>=4 chars)', () => {
      const result = validatePassword('correct-johndoe-battery', policy(), { username: 'johndoe' });
      expect(result.errors).toContainEqual({ code: 'SIMILAR_TO_USERNAME', params: {} });
    });

    it('ignores short usernames', () => {
      const result = validatePassword('correct-bob-battery-staple', policy(), { username: 'bob' });
      expect(result.errors.some((e) => e.code === 'SIMILAR_TO_USERNAME')).toBe(false);
    });

    it('rejects password containing email local-part', () => {
      const result = validatePassword('mypassword-johndoe-2025', policy(), { email: 'johndoe@example.com' });
      expect(result.errors).toContainEqual({ code: 'SIMILAR_TO_EMAIL', params: {} });
    });

    it('normalizes case and unicode before comparing', () => {
      const result = validatePassword('JOHNDOE-strong-passphrase', policy(), { username: 'johndoe' });
      expect(result.errors).toContainEqual({ code: 'SIMILAR_TO_USERNAME', params: {} });
    });
  });

  describe('common passwords', () => {
    it('rejects a top-10k common password when enabled', () => {
      const result = validatePassword('password', policy({ minLength: 4, checkCommonPasswords: true }));
      expect(result.errors).toContainEqual({ code: 'COMMON_PASSWORD', params: {} });
    });

    it('skips check when disabled', () => {
      const result = validatePassword('password', policy({ minLength: 4, checkCommonPasswords: false }));
      expect(result.errors.some((e) => e.code === 'COMMON_PASSWORD')).toBe(false);
    });

    it('case-insensitive match', () => {
      const result = validatePassword('PASSWORD', policy({ minLength: 4, checkCommonPasswords: true }));
      expect(result.errors).toContainEqual({ code: 'COMMON_PASSWORD', params: {} });
    });
  });

  describe('combinations', () => {
    it('reports multiple errors at once', () => {
      const result = validatePassword(
        'abc',
        policy({ requireUppercase: true, requireDigit: true, requireSpecial: true }),
        {},
      );
      const codes = result.errors.map((e) => e.code);
      expect(codes).toEqual(expect.arrayContaining(['MIN_LENGTH', 'MISSING_UPPER', 'MISSING_DIGIT', 'MISSING_SPECIAL']));
    });
  });
});
