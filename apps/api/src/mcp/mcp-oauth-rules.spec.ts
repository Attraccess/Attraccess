import { createHash } from 'node:crypto';
import {
  isAllowedRedirectUri,
  isLoopbackRedirectUri,
  isSecureOrLoopbackOrigin,
  parseScope,
  parseStaticClients,
  randomSecret,
  verifyPkceS256,
} from './mcp-oauth-rules';

describe('MCP OAuth rules', () => {
  it.each([
    ['https://client.example/cb', true],
    ['https://client.example:8443/cb?x=1', true],
    ['http://localhost/cb', true],
    ['http://localhost:5173/cb', true],
    ['http://127.0.0.1:8123/callback', true],
    ['http://[::1]:9000/cb', true],
    ['http://client.example/cb', false],
    ['http://localhost.evil.example/cb', false],
    ['https://client.example/cb#frag', false],
    ['https://user:pw@client.example/cb', false],
    ['myapp://callback', false],
    ['javascript:alert(1)', false],
    ['/relative', false],
    ['', false],
    [undefined, false],
  ])('redirect URI %s allowed=%s', (uri, allowed) => {
    expect(isAllowedRedirectUri(uri)).toBe(allowed);
  });

  it('classifies loopback redirects and public origins', () => {
    expect(isLoopbackRedirectUri('http://127.0.0.1:1/cb')).toBe(true);
    expect(isLoopbackRedirectUri('https://client.example/cb')).toBe(false);
    expect(isSecureOrLoopbackOrigin('https://attraccess.example')).toBe(true);
    expect(isSecureOrLoopbackOrigin('http://localhost:3000')).toBe(true);
    expect(isSecureOrLoopbackOrigin('http://192.168.1.5:3000')).toBe(false);
    expect(isSecureOrLoopbackOrigin('not a url')).toBe(false);
  });

  it('verifies PKCE S256 only', () => {
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
    expect(verifyPkceS256('b'.repeat(43), challenge)).toBe(false);
    expect(verifyPkceS256('short', challenge)).toBe(false);
    expect(verifyPkceS256(verifier, verifier)).toBe(false);
  });

  it('parses scopes as a sorted, de-duplicated permission list; empty means all', () => {
    expect(parseScope('b.read  a.read b.read')).toEqual(['a.read', 'b.read']);
    expect(parseScope('')).toEqual([]);
    expect(parseScope(undefined)).toEqual([]);
  });

  it('generates unguessable prefixed secrets', () => {
    const first = randomSecret('mcp_at_');
    expect(first).toMatch(/^mcp_at_[A-Za-z0-9_-]{43}$/);
    expect(randomSecret('mcp_at_')).not.toBe(first);
  });

  describe('MCP_OAUTH_CLIENTS', () => {
    it('is optional', () => {
      expect(parseStaticClients(undefined)).toEqual([]);
      expect(parseStaticClients('  ')).toEqual([]);
    });

    it('accepts pre-registered public clients', () => {
      expect(
        parseStaticClients(
          JSON.stringify([
            { client_id: 'inspector', client_name: 'Inspector', redirect_uris: ['http://localhost:6274/cb'] },
          ]),
        ),
      ).toEqual([{ clientId: 'inspector', clientName: 'Inspector', redirectUris: ['http://localhost:6274/cb'] }]);
      expect(
        parseStaticClients(JSON.stringify([{ client_id: 'x', redirect_uris: ['https://x.example/cb'] }]))[0].clientName,
      ).toBe('x');
    });

    it.each([
      ['not json', 'valid JSON'],
      ['{}', 'JSON array'],
      [JSON.stringify([{ redirect_uris: ['https://x.example/cb'] }]), 'client_id'],
      [
        JSON.stringify([
          { client_id: 'a', redirect_uris: ['https://x.example/cb'] },
          { client_id: 'a', redirect_uris: ['https://x.example/cb'] },
        ]),
        'duplicate',
      ],
      [JSON.stringify([{ client_id: 'a', redirect_uris: ['http://x.example/cb'] }]), 'redirect_uris'],
      [JSON.stringify([{ client_id: 'a' }]), 'redirect_uris'],
    ])('rejects %s', (raw, message) => {
      expect(() => parseStaticClients(raw)).toThrow(message);
    });
  });
});
