'use strict';

const http = require('http');
const fs = require('fs');
jest.mock('http', () => ({ createServer: jest.fn() }));
jest.mock('fs', () => ({ readFileSync: jest.fn(() => '<html>Config UI</html>') }));
jest.mock('./modules/dnsmasq', () => ({ id: 'dnsmasq', label: 'DNS', init: jest.fn(), handleRequest: jest.fn() }));
jest.mock('./modules/prometheus', () => ({
  id: 'prometheus',
  label: 'Metrics',
  init: jest.fn(),
  handleRequest: jest.fn(),
}));

const dns = require('./modules/dnsmasq');
let listener;
const savedEnvironment = { ...process.env };
const auth = (user = 'admin', password = 'test-config-password') =>
  `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

beforeAll(() => {
  process.env.CONFIG_UI_PASSWORD = 'test-config-password';
  delete process.env.CONFIG_UI_USERNAME;
  http.createServer.mockImplementation((handler) => {
    listener = handler;
    return { listen: jest.fn(), close: jest.fn() };
  });
  jest.spyOn(process, 'on').mockReturnValue(process);
  require('./server');
});
afterAll(() => {
  process.env = savedEnvironment;
  jest.restoreAllMocks();
});
beforeEach(() => {
  process.env.CONFIG_UI_PASSWORD = 'test-config-password';
  delete process.env.CONFIG_UI_USERNAME;
  dns.handleRequest.mockReset();
});

function request(url, authorization = auth(), method = 'GET') {
  return new Promise((resolve) => {
    const res = {
      writeHead: jest.fn(),
      end: jest.fn((body) =>
        resolve({ status: res.writeHead.mock.calls[0][0], body, headers: res.writeHead.mock.calls[0][1] }),
      ),
    };
    listener({ url, method, headers: { authorization } }, res);
  });
}

test.each([undefined, '', 'Bearer token', auth('other'), auth('admin', 'wrong')])(
  'rejects invalid credentials %s',
  async (header) => {
    const response = await request('/', header === undefined ? '' : header);
    expect(response.status).toBe(401);
    expect(response.headers['WWW-Authenticate']).toContain('Basic');
  },
);
test('rejects authentication when no password is configured', async () => {
  delete process.env.CONFIG_UI_PASSWORD;
  expect((await request('/')).status).toBe(401);
});
test('honors a configured username and serves the UI', async () => {
  process.env.CONFIG_UI_USERNAME = 'operator';
  expect((await request('/', auth('operator'))).body).toContain('Config UI');
});
test('reports missing UI assets', async () => {
  fs.readFileSync.mockImplementationOnce(() => {
    throw new Error('missing');
  });
  expect((await request('/')).status).toBe(500);
});
test('lists registered modules', async () => {
  const response = await request('/api/modules?fresh=1');
  expect(JSON.parse(response.body)).toEqual([
    { id: 'dnsmasq', label: 'DNS' },
    { id: 'prometheus', label: 'Metrics' },
  ]);
});
test.each(['/unknown', '/api/unknown/dnsmasq', '/api/modules/missing', '/api/modules/dnsmasq/unknown'])(
  'returns 404 for %s',
  async (url) => {
    expect((await request(url)).status).toBe(404);
  },
);
test('delegates module routes and preserves the method and path', async () => {
  dns.handleRequest.mockImplementation(async (method, pathname, parts, req, res, helpers) => {
    expect([method, pathname, parts]).toEqual(['POST', '/records', ['records']]);
    helpers.sendJson(res, 201, { id: 'record' });
    return true;
  });
  expect((await request('/api/modules/dnsmasq/records', auth(), 'POST')).status).toBe(201);
});
test('returns an internal error for rejected module requests', async () => {
  dns.handleRequest.mockRejectedValue(new Error('storage unavailable'));
  expect((await request('/api/modules/dnsmasq/records')).status).toBe(500);
});
