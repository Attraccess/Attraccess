import { normalizeEmail } from './normalize-email';

describe('normalizeEmail', () => {
  it('trims and lowercases, including non-ASCII letters', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe('alex@example.com');
    expect(normalizeEmail('Ünal@Example.com')).toBe('ünal@example.com');
  });
});
