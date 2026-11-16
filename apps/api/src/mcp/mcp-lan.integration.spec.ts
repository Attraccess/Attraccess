import { Logger } from '@nestjs/common';
import { McpTestApp, startMcpTestApp } from './mcp-app.test-fixture';

// A plain-HTTP deployment on a LAN address: neither https nor loopback.
const PUBLIC_URL = 'http://192.168.1.50:3000';

describe('MCP on a plain-HTTP, non-loopback deployment (real application)', () => {
  let t: McpTestApp;
  let token: string;
  const startupWarnings: string[] = [];

  beforeAll(async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((message: unknown) => {
      startupWarnings.push(String(message));
    });
    try {
      t = await startMcpTestApp(PUBLIC_URL);
    } finally {
      warn.mockRestore();
    }
    const user = await t.createUser(['users.api-tokens.manage', 'users.roles.manage']);
    token = await t.createApiToken(user.id, ['users.api-tokens.manage', 'users.roles.manage']);
  }, 240_000);

  afterAll(async () => {
    await t?.close();
  });

  it('warns at startup, before any request, that OAuth is disabled', () => {
    expect(startupWarnings.filter((message) => message.includes('MCP OAuth is disabled'))).toEqual([
      expect.stringContaining(PUBLIC_URL),
    ]);
  });

  it('boots and keeps /mcp working with API tokens', async () => {
    expect((await t.rpc(token, 'tools/list')).status).toBe(200);
    const roles = await t.callTool(token, 'listRoles');
    expect(roles.body.result.isError).toBeUndefined();
  });

  it('disables the OAuth metadata, registration, authorization and token endpoints', async () => {
    await t.http.get('/.well-known/oauth-protected-resource/api/mcp').expect(404);
    await t.http.get('/.well-known/oauth-authorization-server').expect(404);
    await t.http
      .post('/api/mcp/oauth/register')
      .send({ redirect_uris: ['http://127.0.0.1:1/cb'] })
      .expect(404);
    await t.http.get('/api/mcp/oauth/authorize').expect(404);
    await t.http.post('/api/mcp/oauth/token').type('form').send({ grant_type: 'refresh_token' }).expect(404);
  });

  it('answers 401 without pointing clients at metadata that does not exist', async () => {
    const response = await t.rpc(undefined, 'tools/list');
    expect(response.status).toBe(401);
    expect(response.headers['www-authenticate']).toBe('Bearer realm="Attraccess MCP"');
  });

  it('rejects an OAuth-looking token', async () => {
    expect((await t.rpc('mcp_at_whatever', 'tools/list')).status).toBe(401);
  });
});
