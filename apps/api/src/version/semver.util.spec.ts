import { compareSemver, isNewerSemver, normalizeSemver, parseSemver } from './semver.util';

describe('semver util', () => {
  describe('parseSemver', () => {
    it('parses plain X.Y.Z', () => {
      expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    });

    it('parses version with a leading "v"', () => {
      expect(parseSemver('v0.1.0')).toEqual({ major: 0, minor: 1, patch: 0, prerelease: null });
    });

    it('parses prerelease versions', () => {
      expect(parseSemver('1.2.3-beta.1')).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        prerelease: 'beta.1',
      });
    });

    it('strips build metadata after +', () => {
      expect(parseSemver('1.2.3+build.7')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    });

    it('returns null for invalid strings', () => {
      expect(parseSemver('latest')).toBeNull();
      expect(parseSemver('1.2')).toBeNull();
      expect(parseSemver('1.2.3.4')).toBeNull();
      expect(parseSemver('')).toBeNull();
    });

    it('returns null for null/undefined/non-string input', () => {
      expect(parseSemver(null)).toBeNull();
      expect(parseSemver(undefined)).toBeNull();
      expect(parseSemver(123 as unknown as string)).toBeNull();
    });

    it('trims whitespace before parsing', () => {
      expect(parseSemver('  1.2.3  ')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    });
  });

  describe('normalizeSemver', () => {
    it('strips the leading "v"', () => {
      expect(normalizeSemver('v1.2.3')).toBe('1.2.3');
    });

    it('keeps prerelease suffix', () => {
      expect(normalizeSemver('v1.2.3-rc.1')).toBe('1.2.3-rc.1');
    });

    it('returns null for invalid input', () => {
      expect(normalizeSemver('not-a-version')).toBeNull();
      expect(normalizeSemver(null)).toBeNull();
    });
  });

  describe('compareSemver', () => {
    it('returns 0 for equal versions', () => {
      expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    });

    it('compares major versions', () => {
      expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
      expect(compareSemver('1.0.0', '2.0.0')).toBeLessThan(0);
    });

    it('compares minor versions when major is equal', () => {
      expect(compareSemver('1.2.0', '1.1.99')).toBeGreaterThan(0);
    });

    it('compares patch versions when major and minor are equal', () => {
      expect(compareSemver('1.2.3', '1.2.2')).toBeGreaterThan(0);
    });

    it('ranks a released version higher than a prerelease of the same X.Y.Z', () => {
      expect(compareSemver('1.2.3', '1.2.3-beta')).toBeGreaterThan(0);
      expect(compareSemver('1.2.3-beta', '1.2.3')).toBeLessThan(0);
    });

    it('compares prerelease identifiers numerically when both numeric', () => {
      expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.1')).toBeGreaterThan(0);
    });

    it('ranks numeric prerelease identifiers lower than alphabetic ones', () => {
      expect(compareSemver('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0);
    });

    it('treats a shorter prerelease as lower than one with additional identifiers', () => {
      expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    });

    it('ignores a leading "v" when comparing', () => {
      expect(compareSemver('v1.2.3', '1.2.3')).toBe(0);
      expect(compareSemver('v1.2.4', 'v1.2.3')).toBeGreaterThan(0);
    });

    it('throws for invalid inputs', () => {
      expect(() => compareSemver('bad', '1.0.0')).toThrow();
      expect(() => compareSemver('1.0.0', 'bad')).toThrow();
    });
  });

  describe('isNewerSemver', () => {
    it('returns true when candidate is strictly newer', () => {
      expect(isNewerSemver('1.2.4', '1.2.3')).toBe(true);
    });

    it('returns false when candidate is equal to current', () => {
      expect(isNewerSemver('1.2.3', '1.2.3')).toBe(false);
    });

    it('returns false when candidate is older', () => {
      expect(isNewerSemver('1.2.2', '1.2.3')).toBe(false);
    });

    it('returns false for invalid inputs instead of throwing', () => {
      expect(isNewerSemver('bad', '1.2.3')).toBe(false);
      expect(isNewerSemver('1.2.3', 'bad')).toBe(false);
    });

    it('handles the leading "v" transparently', () => {
      expect(isNewerSemver('v1.2.4', 'v1.2.3')).toBe(true);
    });
  });
});
