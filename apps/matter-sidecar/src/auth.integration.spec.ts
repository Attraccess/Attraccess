import { COMPATIBILITY_TABLE, errorEnvelopeSchema } from '@attraccess/matter-contract';
import { request as httpsRequest } from 'node:https';
import { WebSocket } from 'ws';
import { TEST_TOKEN } from './config';
import { selfSignedCertificate } from './testing/certs';
import { WsClient, http, startSidecar, upgradeStatus, validHeaders, type Running } from './testing/harness';

const PREVIOUS = 'previous-token-0123456789abcdef0123456789';
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const anonymous = () => validHeaders({ authorization: undefined });

describe('service authentication', () => {
  let running: Running;
  beforeAll(async () => {
    running = await startSidecar({ authTokens: [TEST_TOKEN, PREVIOUS] });
  });
  afterAll(() => running.stop());

  const get = (path: string, headers: Record<string, string>) => http(running.port, 'GET', path, { headers });

  it.each([
    ['missing', undefined],
    ['wrong scheme', 'Basic dXNlcjpwYXNz'],
    ['empty token', 'Bearer '],
    ['too short', 'Bearer abc'],
    ['wrong token', `Bearer ${'x'.repeat(40)}`],
    ['two tokens', `Bearer ${TEST_TOKEN} ${TEST_TOKEN}`],
  ])('answers 401 with the standard envelope for a %s credential', async (_name, header) => {
    const result = await get('/v1/capabilities', validHeaders({ authorization: header }));
    expect(result.status).toBe(401);
    expect(errorEnvelopeSchema.parse(result.body).error.code).toBe('unauthorized');
  });

  it('checks authentication before any version admission, revealing nothing about releases', async () => {
    const wrongEverything = anonymous();
    wrongEverything['x-matter-wire-version'] = '99';
    wrongEverything['x-matter-plugin-version'] = '9.9.9';
    const result = await get('/v1/capabilities', wrongEverything);
    expect(result.status).toBe(401);
    expect(result.raw).not.toContain(COMPATIBILITY_TABLE[0].sidecar);
    expect(result.raw).not.toContain('supported');
    expect((await upgradeStatus(running.port, wrongEverything)).status).toBe(401);
  });

  it('does not reveal which paths exist to an unauthenticated caller', async () => {
    expect((await get('/does-not-exist', anonymous())).status).toBe(401);
    expect((await get('/does-not-exist', validHeaders())).status).toBe(404);
  });

  it('requires the token for /version, with no release headers', async () => {
    expect((await get('/version', {})).status).toBe(401);
    expect((await get('/version', bearer(TEST_TOKEN))).status).toBe(200);
  });

  it('accepts both the current and the previous token on REST and on the WebSocket upgrade', async () => {
    for (const token of [TEST_TOKEN, PREVIOUS]) {
      expect((await get('/v1/capabilities', validHeaders(bearer(token)))).status).toBe(200);
      expect((await upgradeStatus(running.port, validHeaders(bearer(token)))).status).toBe(101);
    }
  });

  it('keeps the container probes anonymous and free of versions', async () => {
    const live = await get('/health/live', {});
    const ready = await get('/health/ready', {});
    expect([live.status, ready.status]).toEqual([200, 200]);
    expect(live.raw + ready.raw).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it('still rejects a browser Origin with 403 first, even with a valid token', async () => {
    const headers = { ...validHeaders(), origin: 'http://evil.example' };
    expect((await get('/v1/capabilities', headers)).status).toBe(403);
    expect((await get('/health/live', { origin: 'http://evil.example' })).status).toBe(403);
    expect((await upgradeStatus(running.port, headers)).status).toBe(403);
    expect((await get('/v1/capabilities', { ...anonymous(), origin: 'http://evil.example' })).status).toBe(403);
  });
});

describe('authentication failure logging', () => {
  it('logs at warn level, rate-limited, without the token or the header value', async () => {
    const running = await startSidecar({ authTokens: [TEST_TOKEN, PREVIOUS] });
    const attempt = `${'z'.repeat(20)}guess${'z'.repeat(20)}`;
    for (let i = 0; i < 5; i += 1) {
      await http(running.port, 'GET', '/v1/capabilities', { headers: validHeaders(bearer(attempt)) });
    }
    await http(running.port, 'GET', '/v1/capabilities', { headers: validHeaders() });
    await running.stop();
    const failures = running.logs.filter((line) => line.includes('authentication failed'));
    expect(failures).toHaveLength(1);
    expect(JSON.parse(failures[0])).toMatchObject({ level: 'warn', reason: 'invalid' });
    const everything = running.logs.join('\n');
    for (const secret of [attempt, TEST_TOKEN, PREVIOUS, 'Bearer']) expect(everything).not.toContain(secret);
  });
});

describe('allowed hosts', () => {
  let running: Running;
  afterEach(() => running?.stop());

  it('accepts loopback names always and listed names additionally', async () => {
    running = await startSidecar({ allowedHosts: ['matter.internal'] });
    const call = (host: string) => http(running.port, 'GET', '/health/live', { headers: { host } });
    expect((await call('localhost:1234')).status).toBe(200);
    expect((await call('matter.internal')).status).toBe(200);
    expect((await call('MATTER.internal:8581')).status).toBe(200);
    const refused = await call('evil.example');
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain('MATTER_SIDECAR_ALLOWED_HOSTS');
  });

  it('applies the same host check to the WebSocket upgrade', async () => {
    running = await startSidecar({ allowedHosts: ['matter.internal'] });
    expect((await upgradeStatus(running.port, validHeaders({ host: 'matter.internal' }))).status).toBe(101);
    expect((await upgradeStatus(running.port, validHeaders({ host: 'evil.example' }))).status).toBe(403);
  });
});

describe('native TLS', () => {
  let running: Running;
  afterEach(() => running?.stop());

  it('serves HTTPS and WSS, and warns when plain HTTP is used on a remote bind', async () => {
    const certificate = await selfSignedCertificate();
    running = await startSidecar({
      tls: { cert: Buffer.from(certificate.cert), key: Buffer.from(certificate.key) },
    });
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpsRequest(
        {
          host: '127.0.0.1',
          port: running.port,
          path: '/v1/capabilities',
          ca: certificate.cert,
          servername: 'localhost',
          headers: { ...validHeaders(), host: 'localhost' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(200);
    const secure = await new Promise<number>((resolve, reject) => {
      const socket = new WebSocket(`wss://127.0.0.1:${running.port}/v1/events`, {
        ca: certificate.cert,
        headers: { ...validHeaders(), host: 'localhost' },
      });
      socket.on('open', () => {
        socket.terminate();
        resolve(101);
      });
      socket.on('error', reject);
    });
    expect(secure).toBe(101);
    expect(running.logs.join('\n')).toContain('"tls":true');
    expect(running.logs.join('\n')).not.toContain('MATTER_SIDECAR_ALLOW_INSECURE_REMOTE');
  });

  it('logs a warning when serving plain HTTP on a non-loopback address', async () => {
    running = await startSidecar({ insecureRemote: true });
    expect(running.logs.join('\n')).toContain('MATTER_SIDECAR_ALLOW_INSECURE_REMOTE=true');
  });
});

describe('event stream authentication', () => {
  it('rejects a client without the token and accepts one with it', async () => {
    const running = await startSidecar();
    await expect(WsClient.connect(running.port, anonymous())).rejects.toThrow('HTTP 401');
    const client = await WsClient.connect(running.port);
    client.close();
    await running.stop();
  });
});
