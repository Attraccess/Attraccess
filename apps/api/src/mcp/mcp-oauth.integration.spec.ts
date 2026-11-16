import { createHash, randomBytes } from 'node:crypto';
import { McpOAuthGrant } from '@attraccess/database-entities';
import { McpOAuthService } from './mcp-oauth.service';
import { McpTestApp, startMcpTestApp } from './mcp-app.test-fixture';

const PUBLIC_URL = 'http://localhost:3000';
const RESOURCE = `${PUBLIC_URL}/api/mcp`;
const REDIRECT = 'http://127.0.0.1:8123/callback';
const ADMIN_PERMISSIONS = ['users.roles.manage', 'system.settings.manage'];

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

describe('MCP OAuth (real application)', () => {
  let t: McpTestApp;

  beforeAll(async () => {
    t = await startMcpTestApp(PUBLIC_URL);
  }, 240_000);

  afterAll(async () => {
    await t?.close();
  });

  // Registration is rate limited per IP, so flows register through the service; the HTTP endpoint has its own tests.
  const register = async (redirectUris: string[] = [REDIRECT]) =>
    (
      await t.app
        .get(McpOAuthService)
        .registerClient({ client_name: 'Test client', redirect_uris: redirectUris }, '127.0.0.1')
    ).client_id as string;

  const authorize = (clientId: string, challenge: string, extra: Record<string, string> = {}) =>
    t.http.get('/api/mcp/oauth/authorize').query({
      client_id: clientId,
      redirect_uri: REDIRECT,
      response_type: 'code',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'xyz',
      resource: RESOURCE,
      ...extra,
    });

  /** Signs the user in with a browser session and answers the consent request. */
  async function consent(
    userId: number,
    requestUrl: string,
    decision: 'approve' | 'deny',
    headers: Record<string, string> = { Origin: PUBLIC_URL },
  ) {
    const user = await t.db.getRepository('User').findOneByOrFail({ id: userId });
    const session = await t.createSessionToken(user as never);
    const requestId = new URL(requestUrl).searchParams.get('request') as string;
    return t.http
      .post(`/api/mcp/oauth/requests/${requestId}/${decision}`)
      .set('Cookie', `auth-session=${session}`)
      .set(headers);
  }

  const tokenRequest = (form: Record<string, string>) => t.http.post('/api/mcp/oauth/token').type('form').send(form);

  async function fullFlow(userId: number, scope = '') {
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const started = await authorize(clientId, challenge, scope ? { scope } : {});
    expect(started.status).toBe(302);
    const approved = await consent(userId, started.headers.location, 'approve');
    expect(approved.status).toBe(201);
    const redirected = new URL(approved.body.redirectUrl);
    expect(redirected.origin + redirected.pathname).toBe(REDIRECT);
    expect(redirected.searchParams.get('state')).toBe('xyz');
    const code = redirected.searchParams.get('code') as string;
    const tokens = await tokenRequest({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
      resource: RESOURCE,
    });
    return { clientId, code, verifier, tokens };
  }

  describe('discovery', () => {
    it('serves protected-resource metadata at both well-known locations', async () => {
      for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/api/mcp']) {
        const response = await t.http.get(path).expect(200);
        expect(response.body).toMatchObject({ resource: RESOURCE, authorization_servers: [PUBLIC_URL] });
      }
      await t.http.get('/.well-known/oauth-protected-resource/other').expect(404);
    });

    it('serves authorization-server metadata with DCR and S256', async () => {
      for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration']) {
        const response = await t.http.get(path).expect(200);
        expect(response.body).toMatchObject({
          issuer: PUBLIC_URL,
          authorization_endpoint: `${PUBLIC_URL}/api/mcp/oauth/authorize`,
          token_endpoint: `${PUBLIC_URL}/api/mcp/oauth/token`,
          registration_endpoint: `${PUBLIC_URL}/api/mcp/oauth/register`,
          code_challenge_methods_supported: ['S256'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          token_endpoint_auth_methods_supported: ['none'],
        });
        expect(response.body.scopes_supported).toContain('resources.read');
      }
    });
  });

  describe('dynamic client registration', () => {
    it('registers a public client and persists it', async () => {
      const response = await t.http
        .post('/api/mcp/oauth/register')
        .send({ client_name: 'Persisted', redirect_uris: [REDIRECT, 'https://client.example/cb'] })
        .expect(201);
      expect(response.body).toMatchObject({
        token_endpoint_auth_method: 'none',
        redirect_uris: [REDIRECT, 'https://client.example/cb'],
      });
      const rows = await t.db.query(`SELECT * FROM mcp_oauth_client WHERE clientId = ?`, [response.body.client_id]);
      expect(rows).toHaveLength(1);
    });

    it.each([
      ['plain-HTTP non-loopback redirect', { redirect_uris: ['http://client.example/cb'] }],
      ['fragment in redirect', { redirect_uris: ['https://client.example/cb#x'] }],
      ['custom scheme redirect', { redirect_uris: ['myapp://cb'] }],
      ['no redirect', {}],
      ['confidential client', { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' }],
    ])('rejects %s', async (_name, body) => {
      const response = await t.http.post('/api/mcp/oauth/register').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/invalid_(redirect_uri|client_metadata)/);
    });
  });

  describe('authorization', () => {
    it('shows an error page, never a redirect, for an unknown client or unregistered redirect URI', async () => {
      const { challenge } = pkce();
      const unknown = await authorize('nobody', challenge);
      expect(unknown.status).toBe(400);
      expect(unknown.headers.location).toBeUndefined();
      const clientId = await register();
      const wrongRedirect = await authorize(clientId, challenge, { redirect_uri: 'http://127.0.0.1:9/evil' });
      expect(wrongRedirect.status).toBe(400);
      expect(wrongRedirect.headers.location).toBeUndefined();
    });

    it.each([
      ['a missing PKCE challenge', { code_challenge: '' }, 'invalid_request'],
      ['the plain method', { code_challenge_method: 'plain' }, 'invalid_request'],
      ['a missing resource', { resource: '' }, 'invalid_target'],
      ['a different resource', { resource: 'https://other.example/mcp' }, 'invalid_target'],
      ['an unknown permission', { scope: 'nope.nothing' }, 'invalid_scope'],
    ])('redirects %s back to the client with an error and the state', async (_name, extra, error) => {
      const clientId = await register();
      const response = await authorize(clientId, pkce().challenge, extra);
      expect(response.status).toBe(302);
      const location = new URL(response.headers.location);
      expect(location.origin + location.pathname).toBe(REDIRECT);
      expect(location.searchParams.get('error')).toBe(error);
      expect(location.searchParams.get('state')).toBe('xyz');
    });

    it('sends the browser to the frontend consent page with an opaque request id', async () => {
      const clientId = await register();
      const response = await authorize(clientId, pkce().challenge);
      expect(response.status).toBe(302);
      const location = new URL(response.headers.location);
      expect(location.origin + location.pathname).toBe(`${PUBLIC_URL}/oauth/authorize`);
      expect(location.searchParams.get('request')).toMatch(/^mcp_rq_/);
    });
  });

  describe('consent', () => {
    it('shows the client and the requested permissions to the signed-in user', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const clientId = await register();
      const started = await authorize(clientId, pkce().challenge, { scope: 'users.roles.manage' });
      const session = await t.createSessionToken(user);
      const requestId = new URL(started.headers.location).searchParams.get('request');
      const view = await t.http
        .get(`/api/mcp/oauth/requests/${requestId}`)
        .set('Cookie', `auth-session=${session}`)
        .expect(200);
      expect(view.body).toMatchObject({
        clientName: 'Test client',
        redirectHost: '127.0.0.1:8123',
        loopbackRedirect: true,
        permissions: ['users.roles.manage'],
        unavailablePermissions: [],
        resource: RESOURCE,
      });
      await t.http.get(`/api/mcp/oauth/requests/${requestId}`).expect(401);
    });

    it('refuses a decision sent from a site that is not approved', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const started = await authorize(await register(), pkce().challenge);
      const response = await consent(user.id, started.headers.location, 'approve', { Origin: 'https://evil.example' });
      expect(response.status).toBe(403);
      const noOrigin = await consent(user.id, started.headers.location, 'approve', {});
      expect(noOrigin.status).toBe(403);
    });

    it('does not let a bearer API token or MCP token answer a consent request', async () => {
      const user = await t.createUser(['users.api-tokens.manage', ...ADMIN_PERMISSIONS]);
      const apiToken = await t.createApiToken(user.id, ['users.api-tokens.manage']);
      const started = await authorize(await register(), pkce().challenge);
      const requestId = new URL(started.headers.location).searchParams.get('request');
      const response = await t.http
        .post(`/api/mcp/oauth/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${apiToken}`);
      expect(response.status).toBe(403);
    });

    it('returns access_denied when the user denies', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const started = await authorize(await register(), pkce().challenge);
      const denied = await consent(user.id, started.headers.location, 'deny');
      const location = new URL(denied.body.redirectUrl);
      expect(location.searchParams.get('error')).toBe('access_denied');
      expect(location.searchParams.get('state')).toBe('xyz');
      // The request is single-use.
      expect((await consent(user.id, started.headers.location, 'deny')).status).toBe(404);
    });

    it('rejects, at consent time, permissions the user does not hold', async () => {
      const user = await t.createUser(['users.roles.manage']);
      const started = await authorize(await register(), pkce().challenge, {
        scope: 'users.roles.manage system.settings.manage',
      });
      const session = await t.createSessionToken(user);
      const requestId = new URL(started.headers.location).searchParams.get('request');
      const view = await t.http
        .get(`/api/mcp/oauth/requests/${requestId}`)
        .set('Cookie', `auth-session=${session}`)
        .expect(200);
      expect(view.body.unavailablePermissions).toEqual(['system.settings.manage']);
      const approved = await consent(user.id, started.headers.location, 'approve');
      expect(new URL(approved.body.redirectUrl).searchParams.get('error')).toBe('invalid_scope');
      expect(new URL(approved.body.redirectUrl).searchParams.get('code')).toBeNull();
    });
  });

  describe('token endpoint and MCP access', () => {
    it('runs the whole flow: code, PKCE, tool calls, refresh rotation and reuse detection', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { clientId, tokens } = await fullFlow(user.id);
      expect(tokens.status).toBe(200);
      expect(tokens.headers['cache-control']).toBe('no-store');
      expect(tokens.body).toMatchObject({ token_type: 'Bearer', expires_in: 900 });
      expect(tokens.body.scope.split(' ').sort()).toEqual([...ADMIN_PERMISSIONS].sort());

      const accessToken = tokens.body.access_token as string;
      const list = await t.rpc(accessToken, 'tools/list').expect(200);
      expect(list.body.result.tools.map((tool: { name: string }) => tool.name)).toContain('listRoles');
      const read = await t.callTool(accessToken, 'listRoles').expect(200);
      expect(read.body.result.isError).toBeUndefined();
      const write = await t
        .callTool(accessToken, 'createRole', { name: 'Created via OAuth', permissionKeys: ['users.roles.manage'] })
        .expect(200);
      expect(write.body.result.isError).toBeUndefined();

      // The audit trail names the OAuth method.
      const rows: Array<Record<string, unknown>> = await t.db.query(
        `SELECT * FROM audit_log ORDER BY id DESC LIMIT 10`,
      );
      expect(rows.find((row) => String(row.details).includes('created-via-oauth'))).toMatchObject({
        authenticationMethod: 'mcp-oauth',
        actorId: user.id,
        apiTokenId: null,
      });

      // No full user session was created for the grant.
      const sessions = await t.db
        .query(`SELECT COUNT(*) AS n FROM session WHERE userId = ?`, [user.id])
        .catch(() => [{ n: 0 }]);
      expect(Number(sessions[0].n)).toBeLessThanOrEqual(1);

      // Refresh rotates the token.
      const refreshed = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: tokens.body.refresh_token,
      });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.refresh_token).not.toBe(tokens.body.refresh_token);
      expect((await t.callTool(refreshed.body.access_token, 'listRoles')).status).toBe(200);

      // Replaying the rotated token fails and ends the whole family.
      const replay = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: tokens.body.refresh_token,
      });
      expect(replay.status).toBe(400);
      expect(replay.body.error).toBe('invalid_grant');
      expect((await t.callTool(refreshed.body.access_token, 'listRoles')).status).toBe(401);
      const afterRevoke = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshed.body.refresh_token,
      });
      expect(afterRevoke.body.error).toBe('invalid_grant');
    });

    it('stores only hashed token values', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { tokens } = await fullFlow(user.id);
      const rows = await t.db.query(`SELECT tokenHash FROM mcp_oauth_token`);
      const stored = rows.map((row: { tokenHash: string }) => row.tokenHash);
      expect(stored).not.toContain(tokens.body.access_token);
      expect(stored).not.toContain(tokens.body.refresh_token);
      expect(stored).toContain(createHash('sha256').update(tokens.body.access_token).digest('hex'));
    });

    it.each([
      ['a wrong code verifier', (f: { verifier: string }) => ({ code_verifier: `${f.verifier}x` }), 'invalid_grant'],
      ['a wrong redirect URI', () => ({ redirect_uri: 'http://127.0.0.1:8123/other' }), 'invalid_grant'],
      ['a missing resource', () => ({ resource: '' }), 'invalid_target'],
      ['a different resource', () => ({ resource: 'https://other.example/api/mcp' }), 'invalid_target'],
    ])('rejects a code exchange with %s', async (_name, override, error) => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const clientId = await register();
      const { verifier, challenge } = pkce();
      const started = await authorize(clientId, challenge);
      const approved = await consent(user.id, started.headers.location, 'approve');
      const code = new URL(approved.body.redirectUrl).searchParams.get('code') as string;
      const response = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
        resource: RESOURCE,
        ...override({ verifier }),
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe(error);
    });

    it('accepts an authorization code once; a second use fails and revokes what was issued', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { clientId, code, verifier, tokens } = await fullFlow(user.id);
      const again = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
        resource: RESOURCE,
      });
      expect(again.body.error).toBe('invalid_grant');
      expect((await t.callTool(tokens.body.access_token, 'listRoles')).status).toBe(401);
    });

    it('binds a code to the client it was issued to', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const other = await register();
      const clientId = await register();
      const { verifier, challenge } = pkce();
      const started = await authorize(clientId, challenge);
      const approved = await consent(user.id, started.headers.location, 'approve');
      const code = new URL(approved.body.redirectUrl).searchParams.get('code') as string;
      const response = await tokenRequest({
        grant_type: 'authorization_code',
        client_id: other,
        code,
        redirect_uri: REDIRECT,
        code_verifier: verifier,
        resource: RESOURCE,
      });
      expect(response.body.error).toBe('invalid_grant');
    });

    it('rejects unsupported grant types', async () => {
      const response = await tokenRequest({ grant_type: 'password' });
      expect(response.status).toBe(400);
      expect(response.body.error).toBe('unsupported_grant_type');
    });

    it('accepts an access token only on /mcp: it is bound to the MCP resource audience', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { tokens } = await fullFlow(user.id);
      const accessToken = tokens.body.access_token as string;
      expect((await t.http.get('/api/rbac/roles').set('Authorization', `Bearer ${accessToken}`)).status).toBe(401);
      expect((await t.callTool(accessToken, 'listRoles')).status).toBe(200);
      await t.db
        .getRepository(McpOAuthGrant)
        .update({ userId: user.id }, { resource: 'https://elsewhere.example/api/mcp' });
      expect((await t.callTool(accessToken, 'listRoles')).status).toBe(401);
    });

    it('expires access tokens and absolute grant lifetimes', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { clientId, tokens } = await fullFlow(user.id);
      await t.db.query(
        `UPDATE mcp_oauth_token SET expiresAt = datetime('now', '-1 minute') WHERE kind = 'access' AND grantId IN (SELECT id FROM mcp_oauth_grant WHERE userId = ?)`,
        [user.id],
      );
      expect((await t.callTool(tokens.body.access_token, 'listRoles')).status).toBe(401);
      const refreshed = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: tokens.body.refresh_token,
      });
      expect(refreshed.status).toBe(200);
      await t.db.query(`UPDATE mcp_oauth_grant SET expiresAt = datetime('now', '-1 minute') WHERE userId = ?`, [
        user.id,
      ]);
      expect((await t.callTool(refreshed.body.access_token, 'listRoles')).status).toBe(401);
      const expired = await tokenRequest({
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshed.body.refresh_token,
      });
      expect(expired.body.error).toBe('invalid_grant');
    });

    it('limits OAuth callers to granted ∩ current permissions, re-evaluated on every call', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { tokens } = await fullFlow(user.id, 'users.roles.manage');
      const accessToken = tokens.body.access_token as string;
      expect(tokens.body.scope).toBe('users.roles.manage');
      // Granted subset: roles are readable, settings (not granted) are not.
      expect((await t.callTool(accessToken, 'listRoles')).body.result.isError).toBeUndefined();
      const denied = (await t.callTool(accessToken, 'getSystemSettings')).body.result;
      expect(denied.isError).toBe(true);
      expect(denied.content[0].text).toMatch(/^HTTP 403 Forbidden/);
      // Revoking the role in Attraccess removes the permission on the next call.
      await t.revokeRole(user.id, (user as never as { roleId: number }).roleId, ADMIN_PERMISSIONS);
      const after = (await t.callTool(accessToken, 'listRoles')).body.result;
      expect(after.isError).toBe(true);
      expect(after.content[0].text).toMatch(/^HTTP 403 Forbidden/);
    });

    it('revokes grants together with a deleted or disabled user', async () => {
      const user = await t.createUser(ADMIN_PERMISSIONS);
      const { tokens } = await fullFlow(user.id);
      await t.db.query(`UPDATE "user" SET isDisabled = 1 WHERE id = ?`, [user.id]);
      expect((await t.callTool(tokens.body.access_token, 'listRoles')).status).toBe(401);
    });
  });

  describe('rate limiting', () => {
    it('limits open client registration per IP', async () => {
      let limited = false;
      for (let i = 0; i < 40 && !limited; i++) {
        const response = await t.http.post('/api/mcp/oauth/register').send({ redirect_uris: [REDIRECT] });
        limited = response.status === 429;
        if (limited) expect(response.headers['retry-after']).toBeDefined();
      }
      expect(limited).toBe(true);
    });
  });
});
