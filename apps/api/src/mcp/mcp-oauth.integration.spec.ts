import { createHash } from 'crypto';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { createServer, Server } from 'http';
import request from 'supertest';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Auth, DualAuthGuard, EffectivePermissionsGuard } from '@attraccess/plugins-backend-sdk';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../users-and-auth/auth/session.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';
import { registerMcpOAuthEndpoints } from './mcp-oauth';
import { verifyMcpDelegation } from './mcp-delegation';
import { registerMcpHttpEndpoints } from './mcp-http';
import { operationShape } from './openapi-tools';

@Controller('api/guarded-resources')
class McpOAuthGuardedResourceController {
  @Get(':id')
  @Auth('resources.read')
  read(@Param('id') id: string) { return { id: Number(id), name: 'Guarded OAuth resource' }; }

  @Post(':id')
  @Auth('resources.write')
  write(@Param('id') id: string, @Body() body: { value: string }) { return { id: Number(id), value: body.value }; }
}

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
    app.use(express.json());
    app.use((request, _response, next) => {
      if (request.header('cookie') === 'auth-session=browser-session') {
        (request as typeof request & { cookies?: Record<string, string> }).cookies = { 'auth-session': 'browser-session' };
      }
      next();
    });
    authorizeMcp = registerMcpOAuthEndpoints(app as unknown as NestExpressApplication, {
      resourceUrl: resource,
      secret,
      clientsJson: JSON.stringify([{ client_id: 'desktop', client_name: 'Desktop MCP', redirect_uris: ['http://localhost:34171/callback'] }]),
      prefix: '/api/mcp',
      sessions,
      rbac,
      sessionStrategy: strategy,
    });
    const document = { paths: { '/api/resources/{id}': {
      get: {
        operationId: 'readOAuthResource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { content: { 'application/json': {} } } },
      },
      post: {
        operationId: 'writeOAuthResource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { value: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { content: { 'application/json': {} } } },
      },
    } } };
    const ops = document.paths['/api/resources/{id}'];
    const manifest = Object.fromEntries(Object.entries(ops).map(([method, operation]) => [operation.operationId, {
      decision: 'allow' as const, reason: 'OAuth endpoint authorization integration fixture.',
      shape: operationShape(method, '/api/resources/{id}', operation as never),
    }]));
    const apiRateLimit = rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false });
    app.get('/api/resources/:id', apiRateLimit, async (req, res) => {
      const delegation = verifyMcpDelegation(secret, req.header('x-mcp-delegation') ?? '');
      if (!delegation?.permissions.includes('resources.read')) return res.status(403).json({ message: 'Read denied' });
      return res.json({ id: Number(req.params.id), name: 'OAuth protected resource' });
    });
    app.post('/api/resources/:id', apiRateLimit, async (req, res) => {
      const delegation = verifyMcpDelegation(secret, req.header('x-mcp-delegation') ?? '');
      if (!delegation?.permissions.includes('resources.write')) return res.status(403).json({ message: 'Write denied' });
      return res.json({ id: Number(req.params.id), value: req.body.value });
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('OAuth MCP test server did not bind a TCP port');
    registerMcpHttpEndpoints(app as unknown as NestExpressApplication, {
      document, manifest, resourceUrl: resource, port: address.port, globalPrefix: 'api', delegationSecret: secret, authenticate: authorizeMcp,
    });
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
      .set('Origin', new URL(resource).origin)
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

    const endpointRead = await request(server).post('/api/mcp')
      .set('Authorization', `Bearer ${refreshResponse.body.access_token}`)
      .send({ jsonrpc: '2.0', id: 50, method: 'tools/call', params: { name: 'readOAuthResource', arguments: { id: 9 } } }).expect(200);
    expect(endpointRead.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 9, name: 'OAuth protected resource' }) }] });
    const endpointWrite = await request(server).post('/api/mcp')
      .set('Authorization', `Bearer ${refreshResponse.body.access_token}`)
      .send({ jsonrpc: '2.0', id: 51, method: 'tools/call', params: { name: 'writeOAuthResource', arguments: { id: 9, value: 'x' } } }).expect(200);
    expect(endpointWrite.body.result).toMatchObject({ isError: true, content: [{ text: 'REST 403: Write denied' }] });

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

  it('rejects ordinary application session bearers at the MCP endpoint', async () => {
    await request(server).post('/api/mcp').set('Authorization', 'Bearer browser-session')
      .send({ jsonrpc: '2.0', id: 70, method: 'tools/list' }).expect(401);
  });

  it('rejects cross-origin consent submissions', async () => {
    await request(server)
      .post('/api/mcp/oauth/authorize')
      .set('Origin', 'https://attacker.test')
      .type('form')
      .send({ decision: 'approve' })
      .expect(403);
  });

  it('authorizes OAuth tool calls through Nest REST permission guards', async () => {
    const sessions = new Map<string, typeof user>([['browser-session', user]]);
    let sessionId = 0;
    const sessionService = {
      validateSession: jest.fn(async (token: string) => sessions.get(token) ?? null),
      createSession: jest.fn(async (principal: typeof user) => {
        const token = `guarded-session-${++sessionId}`;
        sessions.set(token, principal);
        return token;
      }),
      consumeSession: jest.fn(async (token: string) => sessions.delete(token)),
    };
    const currentPermissions = new Set(['resources.read', 'resources.write']);
    const rbacService = { getEffectivePermissions: jest.fn(async () => new Set(currentPermissions)) };
    const secretForGuardedApp = 'oauth-guarded-resource-secret';
    const testingModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [McpOAuthGuardedResourceController],
      providers: [
        SessionStrategy, DualAuthGuard, EffectivePermissionsGuard,
        { provide: SessionService, useValue: sessionService },
        { provide: TwoFactorService, useValue: { getStatus: jest.fn(async () => ({ required: false, enabled: true })) } },
        { provide: RbacService, useValue: rbacService },
        { provide: ApiTokenService, useValue: { authenticate: jest.fn(async () => null) } },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn(() => ({ AUTH_SESSION_SECRET: secretForGuardedApp })) } },
      ],
    }).compile();
    const app = testingModule.createNestApplication<NestExpressApplication>();
    const strategy = app.get(SessionStrategy);
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
    const portAddress = portProbe.address();
    if (!portAddress || typeof portAddress === 'string') throw new Error('OAuth guarded test port probe failed');
    const guardedPort = portAddress.port;
    await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
    const resourceUrl = `http://127.0.0.1:${guardedPort}/api/mcp`;
    const document = { paths: { '/api/guarded-resources/{id}': {
      get: {
        operationId: 'guardedReadOAuthResource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { '200': { content: { 'application/json': {} } } },
      },
      post: {
        operationId: 'guardedWriteOAuthResource',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['value'], properties: { value: { type: 'string' } },
        } } } },
        responses: { '201': { content: { 'application/json': {} } } },
      },
    } } };
    const pathItem = document.paths['/api/guarded-resources/{id}'];
    const manifest = Object.fromEntries(Object.entries(pathItem).map(([method, operation]) => [operation.operationId, {
      decision: 'allow' as const, reason: 'Exercise OAuth through application guards.',
      shape: operationShape(method, '/api/guarded-resources/{id}', operation as never),
    }]));
    app.use(cookieParser(), express.json(), express.urlencoded({ extended: false }));
    const authenticateOAuth = registerMcpOAuthEndpoints(app, {
      resourceUrl, secret: secretForGuardedApp,
      clientsJson: JSON.stringify([{ client_id: 'desktop', client_name: 'Desktop MCP', redirect_uris: ['http://localhost:34171/callback'] }]),
      prefix: '/api/mcp', sessions: sessionService as unknown as SessionService,
      rbac: rbacService as unknown as RbacService, sessionStrategy: strategy,
    });
    registerMcpHttpEndpoints(app, {
      document, manifest, resourceUrl, port: guardedPort, globalPrefix: 'api',
      delegationSecret: secretForGuardedApp,
      authenticate: authenticateOAuth,
    });
    await app.init();
    await app.listen(guardedPort, '127.0.0.1');
    try {
      const server = app.getHttpServer();
      const origin = `http://127.0.0.1:${guardedPort}`;
      const actualResource = resourceUrl;
      const verifier = 'b'.repeat(43);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const authorize = await request(server).get('/api/mcp/oauth/authorize')
        .set('Cookie', 'auth-session=browser-session')
        .query({ response_type: 'code', client_id: 'desktop', redirect_uri: 'http://localhost:34171/callback', state: 'guarded', code_challenge: challenge, code_challenge_method: 'S256', resource: actualResource, scope: 'resources.read' })
        .expect(200);
      const consent = authorize.text.match(/name="consent" value="([^"]+)"/)?.[1];
      const approved = await request(server).post('/api/mcp/oauth/authorize')
        .set('Cookie', 'auth-session=browser-session').set('Origin', origin).type('form')
        .send({ consent, decision: 'approve' }).expect(302);
      const token = await request(server).post('/api/mcp/oauth/token').type('form').send({
        grant_type: 'authorization_code', client_id: 'desktop', redirect_uri: 'http://localhost:34171/callback',
        code: new URL(approved.headers.location).searchParams.get('code'), code_verifier: verifier, resource: actualResource,
      }).expect(200);
      const authHeader = `Bearer ${token.body.access_token}`;
      const discovery = await request(server).post('/api/mcp').set('Authorization', authHeader)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      if (discovery.status !== 200) throw new Error(`OAuth MCP discovery failed: ${discovery.status} ${discovery.text}`);
      expect(discovery.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
        'guardedReadOAuthResource', 'guardedWriteOAuthResource',
      ]);
      const unauthenticated = await request(server).post('/api/mcp').send({ jsonrpc: '2.0', id: 2, method: 'tools/list' }).expect(401);
      expect(unauthenticated.body.error.message).toBe('Unauthorized');
      const read = await request(server).post('/api/mcp').set('Authorization', authHeader)
        .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'guardedReadOAuthResource', arguments: { id: 9 } } }).expect(200);
      expect(read.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 9, name: 'Guarded OAuth resource' }) }] });
      const write = await request(server).post('/api/mcp').set('Authorization', authHeader)
        .send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'guardedWriteOAuthResource', arguments: { id: 9, value: 'x' } } }).expect(200);
      expect(write.body.result).toMatchObject({ isError: true, content: [{ text: 'REST 403: Insufficient permissions' }] });
      expect(rbacService.getEffectivePermissions).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
