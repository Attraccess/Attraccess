import { Logger } from '@nestjs/common';
import { deriveCookieSecurity } from './cookie-security';

// Silence the logger during tests so warn() calls don't pollute output
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

describe('deriveCookieSecurity', () => {
  // ─── secure flag (derived from URL scheme) ────────────────────────────────

  describe('secure flag', () => {
    it('is true when URL uses https', () => {
      expect(deriveCookieSecurity('https://app.example.com', 'lax').secure).toBe(true);
      expect(deriveCookieSecurity('https://app.example.com', 'strict').secure).toBe(true);
      expect(deriveCookieSecurity('https://app.example.com', 'none').secure).toBe(true);
    });

    it('is false when URL uses http', () => {
      expect(deriveCookieSecurity('http://localhost:3000', 'lax').secure).toBe(false);
      expect(deriveCookieSecurity('http://localhost:3000', 'strict').secure).toBe(false);
    });

    it('is false when URL is null', () => {
      expect(deriveCookieSecurity(null, 'lax').secure).toBe(false);
    });

    it('is false when URL is an empty string', () => {
      expect(deriveCookieSecurity('', 'lax').secure).toBe(false);
    });
  });

  // ─── SameSite=Lax (default) ───────────────────────────────────────────────

  describe("sameSite 'lax'", () => {
    it('returns lax over https', () => {
      const result = deriveCookieSecurity('https://app.example.com', 'lax');
      expect(result).toEqual({ secure: true, sameSite: 'lax' });
    });

    it('returns lax over http', () => {
      const result = deriveCookieSecurity('http://localhost:3000', 'lax');
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('returns lax when URL is null', () => {
      const result = deriveCookieSecurity(null, 'lax');
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('uses lax as the default when sameSite is omitted', () => {
      const result = deriveCookieSecurity('https://app.example.com');
      expect(result.sameSite).toBe('lax');
    });
  });

  // ─── SameSite=Strict ─────────────────────────────────────────────────────

  describe("sameSite 'strict'", () => {
    it('returns strict over https', () => {
      const result = deriveCookieSecurity('https://app.example.com', 'strict');
      expect(result).toEqual({ secure: true, sameSite: 'strict' });
    });

    it('returns strict over http (no fallback needed for strict)', () => {
      const result = deriveCookieSecurity('http://localhost:3000', 'strict');
      expect(result).toEqual({ secure: false, sameSite: 'strict' });
    });

    it('returns strict when URL is null', () => {
      const result = deriveCookieSecurity(null, 'strict');
      expect(result).toEqual({ secure: false, sameSite: 'strict' });
    });
  });

  // ─── SameSite=None ───────────────────────────────────────────────────────

  describe("sameSite 'none'", () => {
    it('returns none + secure when URL is https (valid combination)', () => {
      const result = deriveCookieSecurity('https://app.example.com', 'none');
      expect(result).toEqual({ secure: true, sameSite: 'none' });
    });

    it('falls back to lax when URL is http (none requires HTTPS)', () => {
      const result = deriveCookieSecurity('http://localhost:3000', 'none');
      // browsers silently reject Non-Secure + None cookies, so we fall back
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('falls back to lax when URL is null (cannot guarantee HTTPS)', () => {
      const result = deriveCookieSecurity(null, 'none');
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('falls back to lax when URL is an empty string', () => {
      const result = deriveCookieSecurity('', 'none');
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('emits a logger warning when falling back from none to lax', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      deriveCookieSecurity('http://localhost', 'none');
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SameSite=None requires a Secure cookie'));
    });

    it('does NOT emit a logger warning for valid none+https', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockClear();
      deriveCookieSecurity('https://app.example.com', 'none');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Default (no sameSite arg) ────────────────────────────────────────────

  describe('default sameSite (no argument)', () => {
    it('defaults to lax over https', () => {
      const result = deriveCookieSecurity('https://app.example.com');
      expect(result).toEqual({ secure: true, sameSite: 'lax' });
    });

    it('defaults to lax over http', () => {
      const result = deriveCookieSecurity('http://localhost:3000');
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });

    it('defaults to lax with null URL', () => {
      const result = deriveCookieSecurity(null);
      expect(result).toEqual({ secure: false, sameSite: 'lax' });
    });
  });

  // ─── Exhaustive matrix ───────────────────────────────────────────────────
  // Ensure every {url, sameSite} combination produces a valid (non-crashing) result

  describe('exhaustive url × sameSite matrix', () => {
    const urls = [
      'https://prod.example.com',
      'http://localhost:3000',
      null,
      '',
    ] as const;
    const policies = ['lax', 'strict', 'none'] as const;

    for (const url of urls) {
      for (const policy of policies) {
        it(`url=${JSON.stringify(url)}, sameSite=${policy} → never throws`, () => {
          expect(() => deriveCookieSecurity(url, policy)).not.toThrow();
        });

        it(`url=${JSON.stringify(url)}, sameSite=${policy} → result has valid shape`, () => {
          const result = deriveCookieSecurity(url, policy);
          expect(typeof result.secure).toBe('boolean');
          expect(['lax', 'strict', 'none']).toContain(result.sameSite);
        });

        it(`url=${JSON.stringify(url)}, sameSite=${policy} → none+non-https always falls back to lax`, () => {
          const isHttps = typeof url === 'string' && url.startsWith('https://');
          const result = deriveCookieSecurity(url, policy);
          if (policy === 'none' && !isHttps) {
            expect(result.sameSite).toBe('lax');
          }
        });

        it(`url=${JSON.stringify(url)}, sameSite=${policy} → none+https never falls back`, () => {
          const isHttps = typeof url === 'string' && url.startsWith('https://');
          const result = deriveCookieSecurity(url, policy);
          if (policy === 'none' && isHttps) {
            expect(result.sameSite).toBe('none');
            expect(result.secure).toBe(true);
          }
        });
      }
    }
  });
});
