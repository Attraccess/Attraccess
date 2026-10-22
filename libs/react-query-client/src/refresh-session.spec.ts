import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { AuthenticationService } from './lib/requests/services.gen';
import { OpenAPI } from './lib/requests/core/OpenAPI';

// Protect the generated wire contract. Backend authorization/rotation is covered by security E2E.
describe('generated refresh client', () => {
  let server: Server;
  const requests: { method: string; url: string; body: unknown; cookie?: string; authorization?: string }[] = [];
  const original = { ...OpenAPI };
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      requests.push({
        method: req.method,
        url: req.url,
        body: JSON.parse(body),
        cookie: req.headers.cookie,
        authorization: req.headers.authorization,
      });
      res.writeHead(201, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ authToken: req.headers.cookie ? '' : 'replacement' }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    OpenAPI.BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    Object.assign(OpenAPI, original);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  it('sends POST with an empty body for cookies and an explicit body-token request for native clients', async () => {
    OpenAPI.HEADERS = { Cookie: 'auth-session=test-cookie' };
    OpenAPI.TOKEN = '';
    expect((await AuthenticationService.refreshSession({ requestBody: {} })).authToken).toBe('');
    OpenAPI.HEADERS = {};
    OpenAPI.TOKEN = 'test-bearer';
    expect((await AuthenticationService.refreshSession({ requestBody: { tokenLocation: 'body' } })).authToken).toBe(
      'replacement',
    );
    expect(requests).toEqual([
      {
        method: 'POST',
        url: '/api/auth/session/refresh',
        body: {},
        cookie: 'auth-session=test-cookie',
        authorization: undefined,
      },
      {
        method: 'POST',
        url: '/api/auth/session/refresh',
        body: { tokenLocation: 'body' },
        cookie: undefined,
        authorization: 'Bearer test-bearer',
      },
    ]);
  });
});
