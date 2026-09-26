import express from 'express';
import request from 'supertest';
import { createServer, Server } from 'http';
import { createServer as createHttpsServer, request as requestHttps } from 'https';
import { readFileSync } from 'fs';
import { createCA, createCert } from 'mkcert';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { Controller, Get, Post, Param, Res } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { Response } from 'express';
import { SessionService } from '../users-and-auth/auth/session.service';
import { TwoFactorService } from '../users-and-auth/auth/two-factor.service';
import { RbacService } from '../users-and-auth/rbac/rbac.service';
import { ApiTokenService } from '../users-and-auth/auth/api-token/api-token.service';
import { AuthAuditLogger } from '../users-and-auth/rate-limiting/auth-audit.logger';
import { ConfigService } from '@nestjs/config';
import { OpenApiDocument, generateMcpTools, McpManifestEntry, operationShape } from './openapi-tools';
import { registerMcpHttpEndpoints } from './mcp-http';
import reviewedManifest from './reviewed-manifest.json';
import { SessionStrategy } from '../users-and-auth/strategies/session.strategy';

/** The swagger export target writes this document from the production Nest application. */
function exportedOpenApiDocument(): OpenApiDocument {
  return JSON.parse(readFileSync('dist/apps/api-swagger/swagger.json', 'utf8')) as OpenApiDocument;
}

@Controller('api')
class McpProductionManifestTestController {
  @Get('info')
  info() { return { name: 'Attraccess API', status: 'ok' }; }

  @Post('messaging/conversations/:id/read')
  @Auth('messaging.write')
  markConversationRead(@Param('id') id: string, @Res() response: Response) {
    return response.status(201).json({ unreadCount: 0, conversationId: Number(id) });
  }
}

describe('MCP HTTP transport', () => {
  let server: Server;
  let port: number;
  const document: OpenApiDocument = {
    paths: {
      '/api/resources/{id}': {
        get: {
          operationId: 'getResourceForMcpTest',
          summary: 'Read a resource',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          responses: { '200': { content: { 'application/json': {} } } },
        },
        post: {
          operationId: 'updateResourceTagsForMcpTest',
          summary: 'Update resource tags',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
          requestBody: { required: true, content: { 'application/json': { schema: {
            type: 'object', required: ['tags'], properties: { tags: { type: 'array', items: { type: 'string' } } },
          } } } },
          responses: { '200': { content: { 'application/json': {} } } },
        },
      },
    },
  };
  const operation = document.paths?.['/api/resources/{id}']?.get;
  const manifest = {
    getResourceForMcpTest: {
      decision: 'allow' as const,
      reason: 'Integration fixture exercises a read-only endpoint.',
      shape: operationShape('GET', '/api/resources/{id}', operation as never),
    },
    updateResourceTagsForMcpTest: {
      decision: 'allow' as const,
      reason: 'Integration fixture exercises a write endpoint.',
      shape: operationShape('POST', '/api/resources/{id}', document.paths?.['/api/resources/{id}']?.post as never),
    },
  };

  beforeEach(async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/resources/:id', (req, res) => {
      if (req.header('authorization') !== 'Bearer api-token-with-read') {
        res.status(403).json({ message: 'Missing resources.read permission' });
        return;
      }
      res.json({ id: Number(req.params.id), name: 'Test resource' });
    });
    app.post('/api/resources/:id', (req, res) => {
      if (req.header('authorization') !== 'Bearer api-token-with-write') {
        res.status(403).json({ message: 'Missing resources.update permission' });
        return;
      }
      res.json({ id: Number(req.params.id), tags: req.body.tags });
    });
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server did not bind a TCP port');
    port = address.port;
    registerMcpHttpEndpoints(app as unknown as NestExpressApplication, {
      document,
      manifest,
      resourceUrl: `http://127.0.0.1:${port}/api/mcp`,
      port,
      globalPrefix: 'api',
      delegationSecret: 'test-secret',
      authenticate: async (req) => {
        if (!['Bearer api-token-with-read', 'Bearer api-token-with-write', 'Bearer restricted-token'].includes(req.header('authorization') ?? '')) {
          throw new Error('Unauthorized');
        }
        req.user = { id: 7, effectivePermissions: new Set(req.header('authorization') === 'Bearer api-token-with-read' ? ['resources.read'] : []) };
      },
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  it('serves protected resource metadata and the tools discovery over HTTP', async () => {
    const metadata = await request(server).get('/.well-known/oauth-protected-resource/api/mcp').expect(200);
    expect(metadata.body.resource).toBe(`http://127.0.0.1:${port}/api/mcp`);
    expect(metadata.body.authorization_servers).toEqual([`http://127.0.0.1:${port}`]);
    const authorizationServer = await request(server).get('/.well-known/oauth-authorization-server').expect(200);
    expect(authorizationServer.body).toMatchObject({
      authorization_endpoint: `http://127.0.0.1:${port}/api/mcp/oauth/authorize`,
      token_endpoint: `http://127.0.0.1:${port}/api/mcp/oauth/token`,
      code_challenge_methods_supported: ['S256'],
    });

    const discovery = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
      .expect(200);
    expect(discovery.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'getResourceForMcpTest', 'updateResourceTagsForMcpTest',
    ]);
  });

  it('authenticates a tool call, delegates to REST, and returns REST authorization failures', async () => {
    const success = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'getResourceForMcpTest', arguments: { id: 12 } } })
      .expect(200);
    expect(success.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 12, name: 'Test resource' }) }] });

    const denied = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer restricted-token')
      .send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'getResourceForMcpTest', arguments: { id: 12 } } })
      .expect(200);
    expect(denied.body.result).toMatchObject({ isError: true, content: [{ text: 'REST 403: Missing resources.read permission' }] });

    const writeDenied = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'updateResourceTagsForMcpTest', arguments: { id: 12, tags: ['production'] } } })
      .expect(200);
    expect(writeDenied.body.result).toMatchObject({ isError: true, content: [{ text: 'REST 403: Missing resources.update permission' }] });

    const writeSuccess = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-write')
      .send({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'updateResourceTagsForMcpTest', arguments: { id: 12, tags: ['production'] } } })
      .expect(200);
    expect(writeSuccess.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 12, tags: ['production'] }) }] });
  });

  it('rate limits MCP HTTP requests by client IP', async () => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await request(server)
        .post('/api/mcp')
        .set('Authorization', 'Bearer api-token-with-read')
        .send({ jsonrpc: '2.0', id: attempt, method: 'tools/list' })
        .expect(200);
    }
    const limited = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 121, method: 'tools/list' })
      .expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('rejects unauthenticated calls and invalid inputs', async () => {
    const unauthorized = await request(server)
      .post('/api/mcp')
      .send({ jsonrpc: '2.0', id: 4, method: 'tools/list' })
      .expect(401);
    expect(unauthorized.body.error.message).toBe('Unauthorized');

    const invalid = await request(server)
      .post('/api/mcp')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'getResourceForMcpTest', arguments: { unexpected: true } } })
      .expect(200);
    expect(invalid.body.result).toMatchObject({ isError: true, content: [{ text: 'Missing required input id' }] });
  });

  it('authenticates notifications and rejects cross-origin browser requests', async () => {
    const unauthenticated = await request(server)
      .post('/api/mcp')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      .expect(401);
    expect(unauthenticated.headers['www-authenticate']).toContain(
      `http://127.0.0.1:${port}/.well-known/oauth-protected-resource/api/mcp`,
    );

    await request(server)
      .post('/api/mcp')
      .set('Origin', 'https://attacker.invalid')
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', id: 8, method: 'tools/list' })
      .expect(403);

    await request(server)
      .post('/api/mcp')
      .set('Origin', `http://127.0.0.1:${port}`)
      .set('Authorization', 'Bearer api-token-with-read')
      .send({ jsonrpc: '2.0', method: 'notifications/initialized' })
      .expect(202);
  });

  it('delegates tool calls to an HTTPS REST listener', async () => {
    const ca = await createCA({ organization: 'MCP integration test', countryCode: 'DE', state: 'Berlin', locality: 'Berlin', validity: 1 });
    const cert = await createCert({ ca: { key: ca.key, cert: ca.cert }, domains: ['127.0.0.1'], validity: 1 });
    const app = express();
    app.use(express.json());
    app.get('/api/resources/:id', (_req, res) => res.json({ id: 23, name: 'TLS resource' }));
    const tlsServer = createHttpsServer({ key: cert.key, cert: cert.cert }, app);
    await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', resolve));
    const address = tlsServer.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTPS server did not bind a TCP port');
    registerMcpHttpEndpoints(app as unknown as NestExpressApplication, {
      document,
      manifest,
      resourceUrl: `https://127.0.0.1:${address.port}/api/mcp`,
      port: address.port,
      secure: true,
      tlsCa: ca.cert,
      globalPrefix: 'api',
      delegationSecret: 'test-secret',
      authenticate: async (req) => { req.user = { id: 7, effectivePermissions: new Set(['resources.read']) }; },
    });
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'getResourceForMcpTest', arguments: { id: 23 } } });
      const result = await new Promise<{ status: number; body: { result: { isError: boolean; content: Array<{ text: string }> } } }>((resolve, reject) => {
        const req = requestHttps({
          hostname: '127.0.0.1', port: address.port, path: '/api/mcp', method: 'POST', ca: ca.cert,
          headers: { authorization: 'Bearer test-token', 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
        }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('error', reject);
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) }));
        });
        req.on('error', reject);
        req.write(body);
        req.end();
      });
      expect(result.status).toBe(200);
      expect(result.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 23, name: 'TLS resource' }) }] });
    } finally {
      await new Promise<void>((resolve, reject) => tlsServer.close((error) => error ? reject(error) : resolve()));
    }
  }, 15000);

  it('uses HTTP delegation when TLS terminates at a reverse proxy', async () => {
    const app = express();
    app.use(express.json());
    app.get('/api/resources/:id', (_req, res) => res.json({ id: 31, name: 'Proxy terminated resource' }));
    const proxyServer = createServer(app);
    await new Promise<void>((resolve) => proxyServer.listen(0, '127.0.0.1', resolve));
    const address = proxyServer.address();
    if (!address || typeof address === 'string') throw new Error('Test HTTP server did not bind a TCP port');
    registerMcpHttpEndpoints(app as unknown as NestExpressApplication, {
      document,
      manifest,
      // This is the externally visible URL; only the proxy speaks HTTPS.
      resourceUrl: `https://access.example/api/mcp`,
      port: address.port,
      secure: false,
      globalPrefix: 'api',
      delegationSecret: 'test-secret',
      authenticate: async (req) => { req.user = { id: 7, effectivePermissions: new Set(['resources.read']) }; },
    });
    try {
      const response = await request(proxyServer)
        .post('/api/mcp')
        .set('Authorization', 'Bearer test-token')
        .send({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'getResourceForMcpTest', arguments: { id: 31 } } })
        .expect(200);
      expect(response.body.result).toMatchObject({ isError: false, content: [{ text: JSON.stringify({ id: 31, name: 'Proxy terminated resource' }) }] });
    } finally {
      await new Promise<void>((resolve, reject) => proxyServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('serves the production Swagger manifest through MCP and enforces the API-token permission intersection', async () => {
    const productionDocument = exportedOpenApiDocument();
    const productionManifest = reviewedManifest as Record<string, McpManifestEntry>;
    const productionTools = generateMcpTools(productionDocument, productionManifest);
    expect(productionTools.map((tool) => tool.name)).toContain('messagingMarkConversationRead');
    const currentOwnerPermissions = new Set(['messaging.read', 'users.api-tokens.manage']);
    const tokenPermissions = ['messaging.read'];

    // Run the real session strategy so MCP authentication uses ATT-919's token
    // permission intersection with the owner's current effective permissions.
    const testModule = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [McpProductionManifestTestController],
      providers: [
        SessionStrategy,
        { provide: SessionService, useValue: { validateSession: jest.fn() } },
        { provide: TwoFactorService, useValue: { getStatus: jest.fn() } },
        { provide: RbacService, useValue: { getEffectivePermissions: jest.fn().mockImplementation(async () => new Set(currentOwnerPermissions)) } },
        { provide: ApiTokenService, useValue: { authenticate: jest.fn().mockResolvedValue({
          user: { id: 42, username: 'mcp-test' },
          apiToken: { id: 8, get permissionKeys() { return tokenPermissions; } },
        }) } },
        { provide: AuthAuditLogger, useValue: { log: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue({ AUTH_SESSION_SECRET: 'production-manifest-test-secret' }) } },
      ],
    }).compile();
    const app = testModule.createNestApplication<NestExpressApplication>();
    const strategy = app.get(SessionStrategy);
    app.use(express.json());
    const portProbe = createServer();
    await new Promise<void>((resolve) => portProbe.listen(0, '127.0.0.1', resolve));
    const probeAddress = portProbe.address();
    if (!probeAddress || typeof probeAddress === 'string') throw new Error('Test port probe did not bind a TCP port');
    const port = probeAddress.port;
    await new Promise<void>((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
    const resourceUrl = `http://127.0.0.1:${port}/api/mcp`;
    registerMcpHttpEndpoints(app, {
      document: productionDocument,
      manifest: productionManifest,
      resourceUrl,
      port,
      globalPrefix: 'api',
      delegationSecret: 'production-manifest-test-secret',
      authenticate: async (req) => { req.user = await strategy.validate(req) as never; },
    });
    await app.init();
    const server = app.getHttpServer();
    await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
    const delegatedRequest = (rpc: unknown) => request(server).post('/api/mcp')
      .set('Authorization', 'Bearer att919-test-token').send(rpc);
    try {
      const discovery = await delegatedRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
      if (discovery.status !== 200) throw new Error(`MCP discovery failed (${discovery.status}): ${JSON.stringify(discovery.body)} ${discovery.text}`);
      expect(discovery.body.result.tools.map((tool: { name: string }) => tool.name)).toContain('messagingMarkConversationRead');

      const read = await delegatedRequest({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'info', arguments: {} } }).expect(200);
      expect(read.body.result.isError).toBe(false);

      const writeDenied = await delegatedRequest({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: {
          name: 'messagingMarkConversationRead', arguments: { id: 3 },
        } }).expect(200);
      expect(writeDenied.body.result).toMatchObject({
        isError: true,
        content: [{ text: 'REST 403: Insufficient permissions' }],
      });

      tokenPermissions.push('messaging.write');
      const ownerStillRestricted = await delegatedRequest({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: {
        name: 'messagingMarkConversationRead', arguments: { id: 3 },
      } }).expect(200);
      expect(ownerStillRestricted.body.result.isError).toBe(true);

      currentOwnerPermissions.add('messaging.write');
      const writeAllowed = await delegatedRequest({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: {
        name: 'messagingMarkConversationRead', arguments: { id: 3 },
      } }).expect(200);
      expect(writeAllowed.body.result).toMatchObject({
        isError: false,
        content: [{ text: JSON.stringify({ unreadCount: 0, conversationId: 3 }) }],
      });
    } finally {
      await app.close();
    }
  }, 30000);
});
