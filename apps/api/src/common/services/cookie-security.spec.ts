import { getHost, getBaseDomain, isSameSite, deriveCookieSecurity } from './cookie-security';

describe('cookie-security', () => {
  describe('getHost', () => {
    it('returns hostname from valid URL', () => {
      expect(getHost('https://api.example.com/path')).toBe('api.example.com');
      expect(getHost('http://localhost:3000')).toBe('localhost');
      expect(getHost('https://sub.app.example.com')).toBe('sub.app.example.com');
    });

    it('returns lowercase hostname', () => {
      expect(getHost('https://API.Example.COM')).toBe('api.example.com');
    });

    it('returns null for empty or invalid input', () => {
      expect(getHost(null)).toBeNull();
      expect(getHost('')).toBeNull();
      expect(getHost('   ')).toBeNull();
      expect(getHost('not-a-url')).toBeNull();
    });

    it('trims whitespace', () => {
      expect(getHost('  https://host.com  ')).toBe('host.com');
    });
  });

  describe('getBaseDomain', () => {
    it('returns last two segments for multi-part hosts', () => {
      expect(getBaseDomain('api.example.com')).toBe('example.com');
      expect(getBaseDomain('app.example.com')).toBe('example.com');
      expect(getBaseDomain('a.b.example.com')).toBe('example.com');
    });

    it('returns host as-is when two or fewer segments', () => {
      expect(getBaseDomain('localhost')).toBe('localhost');
      expect(getBaseDomain('example.com')).toBe('example.com');
    });
  });

  describe('isSameSite', () => {
    it('returns true when both hosts are equal', () => {
      expect(isSameSite('https://api.example.com', 'https://api.example.com')).toBe(true);
    });

    it('returns true when one host is subdomain of the other', () => {
      expect(isSameSite('https://api.example.com', 'https://example.com')).toBe(true);
      expect(isSameSite('https://example.com', 'https://api.example.com')).toBe(true);
      expect(isSameSite('https://a.b.example.com', 'https://example.com')).toBe(true);
    });

    it('returns true for sibling subdomains (same base domain)', () => {
      expect(isSameSite('https://app.example.com', 'https://api.example.com')).toBe(true);
      expect(isSameSite('https://front.vercel.app', 'https://api.vercel.app')).toBe(true);
    });

    it('returns false for different registrable domains', () => {
      expect(isSameSite('https://app.example.com', 'https://api.other.com')).toBe(false);
      expect(isSameSite('https://frontend.vercel.app', 'https://api.mycompany.com')).toBe(false);
    });

    it('returns true when either URL is null (treat as same-site fallback)', () => {
      expect(isSameSite(null, 'https://api.example.com')).toBe(true);
      expect(isSameSite('https://api.example.com', null)).toBe(true);
      expect(isSameSite(null, null)).toBe(true);
    });

    it('returns true for invalid URLs (no host)', () => {
      expect(isSameSite('not-a-url', 'also-not')).toBe(true);
    });
  });

  describe('deriveCookieSecurity', () => {
    it('sets secure true when backend is https', () => {
      expect(deriveCookieSecurity('https://app.example.com', 'https://api.example.com').secure).toBe(true);
      expect(deriveCookieSecurity('http://app.example.com', 'https://api.example.com').secure).toBe(true);
    });

    it('sets secure false when backend is http or missing', () => {
      expect(deriveCookieSecurity('https://app.example.com', 'http://api.example.com').secure).toBe(false);
      expect(deriveCookieSecurity('https://app.example.com', null).secure).toBe(false);
    });

    it('sets sameSite to lax when same site (subdomain of same base domain)', () => {
      const r = deriveCookieSecurity('https://app.example.com', 'https://example.com');
      expect(r.sameSite).toBe('lax');
      expect(r.secure).toBe(true);
    });

    it('sets sameSite to none when cross-site and backend is https', () => {
      const r = deriveCookieSecurity('https://front.vercel.app', 'https://api.mycompany.com');
      expect(r.sameSite).toBe('none');
      expect(r.secure).toBe(true);
    });

    it('sets sameSite to lax when cross-site but backend is http (none requires secure)', () => {
      const r = deriveCookieSecurity('https://front.vercel.app', 'http://api.mycompany.com');
      expect(r.sameSite).toBe('lax');
      expect(r.secure).toBe(false);
    });

    it('handles null URLs with safe defaults', () => {
      const r = deriveCookieSecurity(null, null);
      expect(r.secure).toBe(false);
      expect(r.sameSite).toBe('lax');
    });
  });
});
