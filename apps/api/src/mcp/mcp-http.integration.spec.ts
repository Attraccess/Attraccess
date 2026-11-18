import { McpTestApp, startMcpTestApp } from '../test-utils/mcp-app.test-fixture';
import { createTestDatabaseEnv } from '../test/test-database-env';

const PUBLIC_URL = 'http://localhost:3000';
const RESOURCE_METADATA = `${PUBLIC_URL}/.well-known/oauth-protected-resource/api/mcp`;
const ADMIN_PERMISSIONS = ['users.api-tokens.manage', 'users.roles.manage', 'system.settings.manage'];

type ToolResult = { isError?: boolean; content: Array<{ type: string; text: string }> };
const resultOf = (body: { result: ToolResult }) => body.result;

describe('MCP endpoint with API tokens (real application)', () => {
  let t: McpTestApp;
  const database = createTestDatabaseEnv();
  let admin: { id: number; roleId: number };
  let token: string;

  beforeAll(async () => {
    await database.setup();
    t = await startMcpTestApp(PUBLIC_URL);
    admin = (await t.createUser(ADMIN_PERMISSIONS)) as never;
    token = await t.createApiToken(admin.id, ADMIN_PERMISSIONS);
  }, 240_000);

  afterAll(async () => {
    await t?.close();
    await database.teardown();
  });

  describe('authentication', () => {
    it.each([
      ['no credential', undefined],
      ['an unknown bearer', 'not-a-token'],
      ['an MCP access token that does not exist', 'mcp_at_unknown'],
    ])('answers 401 with the resource metadata link for %s', async (_name, bearer) => {
      const response = await t.rpc(bearer, 'tools/list');
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}"`);
    });

    it('does not accept a cookie session', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const session = await t.createSessionToken(user);
      // A browser sends the Origin of the site; without it the cross-site guard already refuses a cookie POST.
      const response = await t
        .rpc(undefined, 'tools/list', undefined, { Origin: PUBLIC_URL })
        .set('Cookie', `auth-session=${session}`);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toContain('resource_metadata=');
    });

    it('does not accept a user session token as bearer', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const response = await t.rpc(await t.createSessionToken(user), 'tools/list');
      expect(response.status).toBe(401);
    });

    it('rejects revoked, expired and deleted-owner tokens', async () => {
      const owner = await t.createUser(ADMIN_PERMISSIONS);
      const revoked = await t.createApiToken(owner.id, ADMIN_PERMISSIONS);
      expect((await t.rpc(revoked, 'tools/list')).status).toBe(200);
      await t.db.query(`UPDATE api_token SET "revokedAt" = CURRENT_TIMESTAMP WHERE "userId" = $1`, [owner.id]);
      expect((await t.rpc(revoked, 'tools/list')).status).toBe(401);

      const expiring = await t.createUser(ADMIN_PERMISSIONS);
      const expired = await t.createApiToken(expiring.id, ADMIN_PERMISSIONS);
      await t.db.query(`UPDATE api_token SET "expiresAt" = now() - interval '1 hour' WHERE "userId" = $1`, [
        expiring.id,
      ]);
      expect((await t.rpc(expired, 'tools/list')).status).toBe(401);

      const doomed = await t.createUser(ADMIN_PERMISSIONS);
      const orphaned = await t.createApiToken(doomed.id, ADMIN_PERMISSIONS);
      await t.db.query(`UPDATE "user" SET "isDisabled" = true WHERE id = $1`, [doomed.id]);
      expect((await t.rpc(orphaned, 'tools/list')).status).toBe(401);
    });

    it('stops working on the next call when the owner loses users.api-tokens.manage', async () => {
      const owner = await t.createUser(['users.api-tokens.manage', 'users.roles.manage']);
      const bearer = await t.createApiToken(owner.id, ['users.api-tokens.manage', 'users.roles.manage']);
      expect((await t.callTool(bearer, 'listRoles')).status).toBe(200);
      await t.revokeRole(owner.id, (owner as never as { roleId: number }).roleId, [
        'users.api-tokens.manage',
        'users.roles.manage',
      ]);
      expect((await t.callTool(bearer, 'listRoles')).status).toBe(401);
    });
  });

  describe('protocol', () => {
    it.each(['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'])(
      'negotiates protocol version %s',
      async (version) => {
        const response = await t.rpc(token, 'initialize', {
          protocolVersion: version,
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        });
        expect(response.status).toBe(200);
        expect(response.body.result.protocolVersion).toBe(version);
        expect(Object.keys(response.body.result.capabilities)).toEqual(['tools']);
      },
    );

    it('answers a newer, unknown protocol version with the newest one it supports instead of failing', async () => {
      const response = await t.rpc(token, 'initialize', {
        protocolVersion: '2099-01-01',
        capabilities: {},
        clientInfo: { name: 'test', version: '1' },
      });
      expect(response.status).toBe(200);
      expect(typeof response.body.result.protocolVersion).toBe('string');
      expect(response.body.result.protocolVersion >= '2025-11-25').toBe(true);
    });

    it('accepts notifications without a response body', async () => {
      const response = await t.http
        .post('/api/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', `Bearer ${token}`)
        .send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      expect(response.status).toBe(202);
    });

    it('rejects a malformed request and a client that does not accept JSON', async () => {
      const malformed = await t.http
        .post('/api/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .set('Authorization', `Bearer ${token}`)
        .send({ hello: 'world' });
      expect(malformed.status).toBe(400);
      const wrongAccept = await t.http
        .post('/api/mcp')
        .set('Accept', 'text/html')
        .set('Authorization', `Bearer ${token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      expect(wrongAccept.status).toBe(406);
    });

    it('offers no server-to-client stream: GET and DELETE are 405', async () => {
      expect((await t.http.get('/api/mcp').set('Authorization', `Bearer ${token}`)).status).toBe(405);
      expect((await t.http.delete('/api/mcp').set('Authorization', `Bearer ${token}`)).status).toBe(405);
    });

    it('reports an unknown tool as a protocol error', async () => {
      const response = await t.callTool(token, 'noSuchTool');
      expect(response.status).toBe(200);
      expect(response.body.error.code).toBe(-32602);
    });
  });

  describe('tools', () => {
    it('lists the allowed operations by operationId and none of the denied ones', async () => {
      const response = await t.rpc(token, 'tools/list');
      const tools = response.body.result.tools as Array<{
        name: string;
        description: string;
        inputSchema: { additionalProperties: boolean };
      }>;
      const names = tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['listRoles', 'createRole', 'getAllResources', 'info']));
      for (const denied of [
        'createSession',
        'createApiToken',
        'rebootHost',
        'getLogo',
        'notificationsLive',
        'uploadPlugin',
        'getFrontendPluginFile',
        'approveMcpOAuthRequest',
      ]) {
        expect(names).not.toContain(denied);
      }
      expect(tools.every((tool) => tool.inputSchema.additionalProperties === false && tool.description)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    });

    it('runs a read call and a write call through the REST pipeline', async () => {
      const read = resultOf((await t.callTool(token, 'listRoles')).body);
      expect(read.isError).toBeUndefined();
      expect(JSON.parse(read.content[0].text).length).toBeGreaterThan(0);

      const write = resultOf(
        (await t.callTool(token, 'createRole', { name: 'Created through MCP', permissionKeys: ['users.roles.manage'] }))
          .body,
      );
      expect(write.isError).toBeUndefined();
      expect(JSON.parse(write.content[0].text)).toMatchObject({ name: 'Created through MCP' });
    });

    it('surfaces REST errors as tool errors with the status and message', async () => {
      const invalid = resultOf((await t.callTool(token, 'createRole', { permissionKeys: [] })).body);
      expect(invalid.isError).toBe(true);
      expect(invalid.content[0].text).toMatch(/^HTTP 400 Bad Request: /);

      const missing = resultOf((await t.callTool(token, 'getOneUserById', { id: 987654 })).body);
      expect(missing.isError).toBe(true);
      expect(missing.content[0].text).toMatch(/^HTTP (404 Not Found|403 Forbidden)/);

      const unknownArgument = resultOf((await t.callTool(token, 'listRoles', { nope: 1 })).body);
      expect(unknownArgument.isError).toBe(true);
      expect(unknownArgument.content[0].text).toContain('Unknown argument');
    });

    it('enforces the token allow-list intersected with the owner permissions', async () => {
      const owner = await t.createUser(ADMIN_PERMISSIONS);
      // Token allow-list narrower than the owner: reading roles is not part of it.
      const narrow = await t.createApiToken(owner.id, ['users.api-tokens.manage']);
      const denied = resultOf((await t.callTool(narrow, 'listRoles')).body);
      expect(denied.isError).toBe(true);
      expect(denied.content[0].text).toMatch(/^HTTP 403 Forbidden: Insufficient permissions/);
      const readCapable = await t.createApiToken(owner.id, ['users.api-tokens.manage', 'users.roles.manage']);
      expect(resultOf((await t.callTool(readCapable, 'listRoles')).body).isError).toBeUndefined();
      // Losing a role permission in Attraccess removes it from the token on the next call.
      await t.revokeRole(owner.id, (owner as never as { roleId: number }).roleId, ADMIN_PERMISSIONS);
      expect((await t.callTool(readCapable, 'listRoles')).status).toBe(401);
    });

    it('handles body-less 204 responses', async () => {
      const created = resultOf(
        (await t.callTool(token, 'createRole', { name: 'To delete', permissionKeys: ['users.roles.manage'] })).body,
      );
      const { id } = JSON.parse(created.content[0].text) as { id: number };
      const deleted = resultOf((await t.callTool(token, 'deleteRole', { id })).body);
      expect(deleted.isError).toBeUndefined();
      expect(deleted.content[0].text).toMatch(/^HTTP 20\d/);
    });

    it('does not accept the OAuth credential type at REST endpoints', async () => {
      const response = await t.http.get('/api/rbac/roles').set('Authorization', 'Bearer mcp_at_anything');
      expect(response.status).toBe(401);
    });

    it('audits changes with the real client address, user agent and API-token method', async () => {
      await t
        .rpc(
          token,
          'tools/call',
          { name: 'createRole', arguments: { name: 'Audited through MCP', permissionKeys: ['users.roles.manage'] } },
          { 'User-Agent': 'mcp-test-client/1.0' },
        )
        .expect(200);
      const rows: Array<Record<string, unknown>> = await t.db.query(
        `SELECT * FROM audit_log ORDER BY id DESC LIMIT 20`,
      );
      const entry = rows.find((row) => JSON.stringify(row).includes('audited-through-mcp'));
      expect(entry).toMatchObject({ authenticationMethod: 'api-token', actorId: admin.id });
      expect(entry?.ipAddress).toMatch(/127\.0\.0\.1|::1/);
      expect(entry?.userAgent).toBe('mcp-test-client/1.0');
    });
  });
});
