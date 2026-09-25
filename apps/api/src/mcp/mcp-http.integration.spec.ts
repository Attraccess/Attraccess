import express from 'express';
import request from 'supertest';
import { createServer, Server } from 'http';
import { NestExpressApplication } from '@nestjs/platform-express';
import { OpenApiDocument, operationShape } from './openapi-tools';
import { registerMcpHttpEndpoints } from './mcp-http';

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
});
