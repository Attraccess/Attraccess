import cookieParser from 'cookie-parser';
import { createHash } from 'crypto';
import express from 'express';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SessionService } from '../users-and-auth/auth/session.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { registerMcpOAuthEndpoints } from './mcp-oauth';
import { verifyMcpDelegation } from './mcp-delegation';

describe('MCP OAuth authorization code and refresh grants', () => {
  const resource = 'https://api.example.test/api/mcp';
  const secret = 'test-oauth-secret';
  const user = { id: 17, username: 'oauth-user' };
  let server: Server;
  let activeSessions: Map<string, typeof user>;
  let nextSession: number;
  let permissions: Set<string>;
  let authorizeMcp: (request: Parameters<ReturnType<typeof registerMcpOAuthEndpoints>>[0]) => Promise<void>;

  beforeEach(async () => {
    activeSessions = new Map();
    activeSessions.set('browser-session', user);
    nextSession = 0;
    permissions = new Set(['resources.read', 'resources.update']);
    const sessions = {
      validateSession: jest.fn(async (token: string) => activeSessions.get(token) ?? null),
      createSession: jest.fn(async (principal: typeof user) => {
        const token = `session-${++nextSession}`;
        activeSessions.set(token, principal);
        return token;
      }),
      consumeSession: jest.fn(async (token: string) => activeSessions.delete(token)),
    } as unknown as SessionService;
    const rbac = { getEffectivePermissions: jest.fn(async () => new Set(permissions)) } as unknown as RbacService;
    const strategy = { validate: jest.fn(async () => ({ ...user })) } as unknown as SessionStrategy;
    const app = express();
    app.use(cookieParser());
    authorizeMcp = registerMcpOAuthEndpoints(app as unknown as NestExpressApplication, {
      resourceUrl: resource,
      secret,
      clientsJson: JSON.stringify([{ client_id: 'desktop', client_name: 'Desktop MCP', redirect_uris: ['http://localhost:34171/callback'] }]),
      prefix: '/api/mcp',
      sessions,
      rbac,
      sessionStrategy: strategy,
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('requires consent, enforces PKCE and audience, rotates refresh tokens, and clamps current permissions', async () => {
    const verifier = 'a'.repeat(43);
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const authorize = await request(server)
      .get('/api/mcp/oauth/authorize')
      .set('Cookie', 'auth-session=browser-session')
      .query({
        response_type: 'code', client_id: 'desktop', redirect_uri: 'http://localhost:34171/callback',
        state: 'state-123', code_challenge: challenge, code_challenge_method: 'S256', resource,
        scope: 'resources.read',
      })
      .expect(200);
    const consent = authorize.text.match(/name="consent" value="([^"]+)"/)?.[1];
    expect(consent).toBeTruthy();
    expect(authorize.text).toContain('resources.read');

    const approved = await request(server)
      .post('/api/mcp/oauth/authorize')
      .set('Cookie', 'auth-session=browser-session')
      .set('Origin', `http://127.0.0.1:${(server.address() as AddressInfo).port}`)
      .type('form')
      .send({ consent, decision: 'approve' })
      .expect(302);
    const authorizationCode = new URL(approved.headers.location).searchParams.get('code');
    expect(new URL(approved.headers.location).searchParams.get('state')).toBe('state-123');
    expect(authorizationCode).toBeTruthy();

    const tokenResponse = await request(server)
      .post('/api/mcp/oauth/token')
      .type('form')
      .send({
        grant_type: 'authorization_code', client_id: 'desktop', redirect_uri: 'http://localhost:34171/callback',
        code: authorizationCode, code_verifier: verifier, resource,
      })
      .expect(200);
    expect(tokenResponse.body).toMatchObject({ token_type: 'Bearer', expires_in: 900, scope: 'resources.read' });
    expect(tokenResponse.body.access_token).toMatch(/^mcp1\./);

    const refreshResponse = await request(server)
      .post('/api/mcp/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', client_id: 'desktop', refresh_token: tokenResponse.body.refresh_token, resource })
      .expect(200);
    expect(refreshResponse.body.refresh_token).not.toBe(tokenResponse.body.refresh_token);

    await request(server)
      .post('/api/mcp/oauth/token')
      .type('form')
      .send({ grant_type: 'refresh_token', client_id: 'desktop', refresh_token: tokenResponse.body.refresh_token, resource })
      .expect(400);

    const accessRequest = {
      headers: { authorization: `Bearer ${refreshResponse.body.access_token}` },
      path: '/api/mcp',
      header(name: string) { return this.headers[name.toLowerCase()]; },
    } as Parameters<ReturnType<typeof registerMcpOAuthEndpoints>>[0];
    permissions = new Set();
    await authorizeMcp(accessRequest);
    expect(accessRequest.headers.authorization).toMatch(/^Bearer session-/);
    expect(accessRequest.headers.authorization).not.toBe(`Bearer ${refreshResponse.body.access_token}`);
    expect(accessRequest.headers['x-mcp-delegation']).toBeTruthy();
    expect(verifyMcpDelegation(secret, accessRequest.headers['x-mcp-delegation'] as string)?.permissions).toEqual([]);
    expect(accessRequest.headers.authorization).not.toContain('mcp1.');
  });

  it('rejects authorization requests without a logged in browser or with an unregistered redirect URI', async () => {
    await request(server)
      .get('/api/mcp/oauth/authorize')
      .query({ response_type: 'code', client_id: 'desktop', redirect_uri: 'https://attacker.test/callback', state: 'x', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', resource })
      .expect(400);
    await request(server)
      .get('/api/mcp/oauth/authorize')
      .query({ response_type: 'code', client_id: 'desktop', redirect_uri: 'http://localhost:34171/callback', state: 'x', code_challenge: 'a'.repeat(43), code_challenge_method: 'S256', resource })
      .expect(401);
  });

  it('rejects cross-origin consent submissions', async () => {
    await request(server)
      .post('/api/mcp/oauth/authorize')
      .set('Origin', 'https://attacker.test')
      .type('form')
      .send({ decision: 'approve' })
      .expect(403);
  });
});
