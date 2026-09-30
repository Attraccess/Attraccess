import { normalizeServerUrl } from './server-url';

describe('normalizeServerUrl', () => {
  it('prepends http:// to a bare host:port', () => {
    expect(normalizeServerUrl('localhost:3000')).toBe('http://localhost:3000');
  });

  it('leaves an http:// URL untouched', () => {
    expect(normalizeServerUrl('http://example.com')).toBe('http://example.com');
  });

  it('leaves an https:// URL untouched (case-insensitive)', () => {
    expect(normalizeServerUrl('HTTPS://example.com')).toBe('HTTPS://example.com');
  });

  it('produces a value that new URL() can parse', () => {
    const url = new URL('/api/info', normalizeServerUrl('localhost:3000'));
    expect(url.toString()).toBe('http://localhost:3000/api/info');
  });
});
