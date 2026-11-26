import { createHash, randomBytes } from 'node:crypto';
import { McpOAuthService } from './mcp-oauth.service';
import { McpRateLimitGuard } from './mcp-rate-limit.guard';
import { McpTestApp, startMcpTestApp } from '../test-utils/mcp-app.test-fixture';

const PUBLIC_URL = 'http://localhost:3000';
const RESOURCE = `${PUBLIC_URL}/api/mcp`;
const REDIRECT = 'http://127.0.0.1:8123/callback';
const PERMISSIONS = ['users.roles.manage', 'system.settings.manage'];

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

describe('MCP OAuth consent: choosing permissions, and the grant list (real application)', () => {
  let t: McpTestApp;

  beforeAll(async () => {
    t = await startMcpTestApp(PUBLIC_URL);
  }, 240_000);

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(() => {
    t.app.get(McpRateLimitGuard)['limiter'].reset();
  });

  const cookieOf = async (userId: number) =>
    `auth-session=${await t.createSessionToken((await t.db.getRepository('User').findOneByOrFail({ id: userId })) as never)}`;

  const start = async (scope?: string) => {
    const clientId = (
      await t.app
        .get(McpOAuthService)
        .registerClient({ client_name: 'Chooser', redirect_uris: [REDIRECT] }, '127.0.0.1')
    ).client_id as string;
    const { verifier, challenge } = pkce();
    const started = await t.http.get('/api/mcp/oauth/authorize').query({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      resource: RESOURCE,
      ...(scope ? { scope } : {}),
    });
    const requestId = new URL(started.headers.location).searchParams.get('request') as string;
    return { clientId, verifier, requestId };
  };

  const approve = async (userId: number, requestId: string, body?: unknown) => {
    const call = t.http
      .post(`/api/mcp/oauth/requests/${requestId}/approve`)
      .set('Cookie', await cookieOf(userId))
      .set('Origin', PUBLIC_URL);
    return body === undefined ? call : call.send(body as object);
  };

  const exchange = async (flow: { clientId: string; verifier: string }, redirectUrl: string) =>
    t.http
      .post('/api/mcp/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: flow.clientId,
        code: new URL(redirectUrl).searchParams.get('code') as string,
        redirect_uri: REDIRECT,
        code_verifier: flow.verifier,
        resource: RESOURCE,
      });

  /** Runs a whole authorization with the given body and returns the token response. */
  async function grantWith(userId: number, scope: string | undefined, body?: unknown) {
    const flow = await start(scope);
    const approved = await approve(userId, flow.requestId, body);
    expect(approved.status).toBe(201);
    const tokens = await exchange(flow, approved.body.redirectUrl);
    expect(tokens.status).toBe(200);
    return { flow, tokens };
  }

  const toolNames = async (accessToken: string) =>
    ((await t.rpc(accessToken, 'tools/list')).body.result.tools as Array<{ name: string }>).map((tool) => tool.name);

  describe('approve with a permission choice', () => {
    it('grants exactly the chosen keys, sorted and de-duplicated, and lists only the matching tools', async () => {
      const user = await t.createUser(PERMISSIONS);
      const { tokens } = await grantWith(user.id, undefined, {
        permissionKeys: ['users.roles.manage', 'users.roles.manage'],
      });
      expect(tokens.body.scope).toBe('users.roles.manage');
      const names = await toolNames(tokens.body.access_token);
      expect(names).toContain('listRoles');
      expect(names).not.toContain('getSystemSettings');
    });

    it('may grant more than the client requested, as long as the user holds it', async () => {
      const user = await t.createUser(PERMISSIONS);
      const { tokens } = await grantWith(user.id, 'users.roles.manage', {
        permissionKeys: ['system.settings.manage', 'users.roles.manage'],
      });
      expect(tokens.body.scope.split(' ')).toEqual(['system.settings.manage', 'users.roles.manage']);
      expect(await toolNames(tokens.body.access_token)).toEqual(expect.arrayContaining(['listRoles', 'createRole']));
    });

    it.each([
      ['an empty list', { permissionKeys: [] }, 'at least one'],
      ['a key the user does not hold', { permissionKeys: ['users.roles.manage', 'billing.manage'] }, 'do not hold'],
      ['an unknown key', { permissionKeys: ['no.such.permission'] }, 'Unknown permissions'],
      ['a non-array', { permissionKeys: 'users.roles.manage' }, ''],
      ['non-string items', { permissionKeys: [1] }, ''],
    ])('answers 400 for %s and leaves the request usable', async (_name, body, message) => {
      const user = await t.createUser(['users.roles.manage']);
      const flow = await start();
      const rejected = await approve(user.id, flow.requestId, body);
      expect(rejected.status).toBe(400);
      if (message) expect(JSON.stringify(rejected.body)).toContain(message);
      // Corrected and retried: the request was not consumed.
      const retried = await approve(user.id, flow.requestId, { permissionKeys: ['users.roles.manage'] });
      expect(retried.status).toBe(201);
      expect((await exchange(flow, retried.body.redirectUrl)).body.scope).toBe('users.roles.manage');
    });

    it('keeps the old behaviour without a body: the requested scope, or all current permissions', async () => {
      const user = await t.createUser(PERMISSIONS);
      const requested = await grantWith(user.id, 'users.roles.manage');
      expect(requested.tokens.body.scope).toBe('users.roles.manage');
      const all = await grantWith(user.id, undefined);
      expect(all.tokens.body.scope.split(' ').sort()).toEqual([...PERMISSIONS].sort());
    });

    it('still redirects with invalid_scope, without a body, when the request exceeds the user', async () => {
      const user = await t.createUser(['users.roles.manage']);
      const flow = await start('users.roles.manage system.settings.manage');
      const approved = await approve(user.id, flow.requestId);
      expect(new URL(approved.body.redirectUrl).searchParams.get('error')).toBe('invalid_scope');
    });
  });

  describe('consent view', () => {
    it('offers the available permissions, the requested keys and the tools they could unlock', async () => {
      const user = await t.createUser(PERMISSIONS);
      const flow = await start('users.roles.manage');
      const view = await t.http
        .get(`/api/mcp/oauth/requests/${flow.requestId}`)
        .set('Cookie', await cookieOf(user.id))
        .expect(200);
      expect(view.body.permissions.map((permission: { key: string }) => permission.key)).toEqual([
        'users.roles.manage',
      ]);
      expect(view.body.requestedPermissionKeys).toEqual(['users.roles.manage']);
      expect(view.body.availablePermissions.map((permission: { key: string }) => permission.key)).toEqual([
        'system.settings.manage',
        'users.roles.manage',
      ]);
      expect(view.body.availablePermissions[0]).toMatchObject({ label: expect.any(String), category: 'system' });
      const listRoles = view.body.tools.find((tool: { name: string }) => tool.name === 'listRoles');
      expect(listRoles).toEqual({
        name: 'listRoles',
        summary: expect.any(String),
        requiredAll: expect.any(Array),
        requiredAny: expect.any(Array),
      });
      expect(listRoles.summary).not.toContain('\n');
      // Only what the user's own permissions could unlock.
      expect(view.body.tools.map((tool: { name: string }) => tool.name)).not.toContain('getAllUsers');
    });

    it('reports every available key as requested when the client asked for all', async () => {
      const user = await t.createUser(PERMISSIONS);
      const flow = await start();
      const view = await t.http
        .get(`/api/mcp/oauth/requests/${flow.requestId}`)
        .set('Cookie', await cookieOf(user.id))
        .expect(200);
      expect(view.body.requestedAll).toBe(true);
      expect(view.body.requestedPermissionKeys).toEqual(['system.settings.manage', 'users.roles.manage']);
    });
  });

  describe('connected clients', () => {
    it("lists only the caller's active grants, newest first", async () => {
      const user = await t.createUser(PERMISSIONS);
      const other = await t.createUser(PERMISSIONS);
      const first = await grantWith(user.id, 'users.roles.manage');
      const second = await grantWith(user.id, undefined, { permissionKeys: ['system.settings.manage'] });
      await grantWith(other.id, undefined);
      const revoked = await grantWith(user.id, undefined);
      const [revokedGrant] = (await t.db.query(
        `SELECT id FROM mcp_oauth_grant WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
        [user.id],
      )) as Array<{ id: string }>;
      await t.http
        .delete(`/api/mcp/oauth/grants/${revokedGrant.id}`)
        .set('Cookie', await cookieOf(user.id))
        .set('Origin', PUBLIC_URL)
        .expect(204);

      const list = await t.http
        .get('/api/mcp/oauth/grants')
        .set('Cookie', await cookieOf(user.id))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(list.body.map((grant: { permissionKeys: string[] }) => grant.permissionKeys)).toEqual([
        ['system.settings.manage'],
        ['users.roles.manage'],
      ]);
      expect(list.body[0]).toMatchObject({
        clientName: 'Chooser',
        registeredByOperator: false,
        lastUsedAt: null,
        id: expect.any(String),
        createdAt: expect.any(String),
        expiresAt: expect.any(String),
      });
      expect([first, second, revoked].every((flow) => flow.tokens.status === 200)).toBe(true);
    });

    it('revokes a grant: its access and refresh tokens stop working', async () => {
      const user = await t.createUser(PERMISSIONS);
      const { flow, tokens } = await grantWith(user.id, undefined);
      expect((await t.rpc(tokens.body.access_token, 'tools/list')).status).toBe(200);
      const [grant] = (await t.db.query(`SELECT id FROM mcp_oauth_grant WHERE "userId" = $1`, [user.id])) as Array<{
        id: string;
      }>;
      await t.http
        .delete(`/api/mcp/oauth/grants/${grant.id}`)
        .set('Cookie', await cookieOf(user.id))
        .set('Origin', PUBLIC_URL)
        .expect(204);
      expect((await t.rpc(tokens.body.access_token, 'tools/list')).status).toBe(401);
      const refreshed = await t.http.post('/api/mcp/oauth/token').type('form').send({
        grant_type: 'refresh_token',
        client_id: flow.clientId,
        refresh_token: tokens.body.refresh_token,
        resource: RESOURCE,
      });
      expect(refreshed.status).toBe(400);
      expect(refreshed.body.error).toBe('invalid_grant');
    });

    it('answers 404 for a missing grant and for the grant of another user, and leaves the latter alone', async () => {
      const owner = await t.createUser(PERMISSIONS);
      const stranger = await t.createUser(PERMISSIONS);
      const { tokens } = await grantWith(owner.id, undefined);
      const [grant] = (await t.db.query(`SELECT id FROM mcp_oauth_grant WHERE "userId" = $1`, [owner.id])) as Array<{
        id: string;
      }>;
      const asStranger = async (id: string) =>
        t.http
          .delete(`/api/mcp/oauth/grants/${id}`)
          .set('Cookie', await cookieOf(stranger.id))
          .set('Origin', PUBLIC_URL);
      expect((await asStranger(grant.id)).status).toBe(404);
      expect((await asStranger('00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await t.rpc(tokens.body.access_token, 'tools/list')).status).toBe(200);
    });

    it('is session-only: API tokens and MCP tokens are rejected', async () => {
      const user = await t.createUser(['users.api-tokens.manage', ...PERMISSIONS]);
      const apiToken = await t.createApiToken(user.id, ['users.api-tokens.manage']);
      const { tokens } = await grantWith(user.id, undefined);
      const [grant] = (await t.db.query(`SELECT id FROM mcp_oauth_grant WHERE "userId" = $1`, [user.id])) as Array<{
        id: string;
      }>;
      expect((await t.http.get('/api/mcp/oauth/grants').set('Authorization', `Bearer ${apiToken}`)).status).toBe(403);
      expect(
        (await t.http.delete(`/api/mcp/oauth/grants/${grant.id}`).set('Authorization', `Bearer ${apiToken}`)).status,
      ).toBe(403);
      expect(
        (await t.http.get('/api/mcp/oauth/grants').set('Authorization', `Bearer ${tokens.body.access_token}`)).status,
      ).toBe(401);
      await t.http.get('/api/mcp/oauth/grants').expect(401);
    });

    it('never offers the grant endpoints or the consent endpoints as tools', async () => {
      const user = await t.createUser(PERMISSIONS);
      const { tokens } = await grantWith(user.id, undefined);
      const names = await toolNames(tokens.body.access_token);
      for (const id of ['listMcpOAuthGrants', 'revokeMcpOAuthGrant', 'getMcpOAuthRequest', 'approveMcpOAuthRequest']) {
        expect(names).not.toContain(id);
      }
    });
  });
});
