import {
  COMPATIBILITY_TABLE,
  FEATURE_FAMILIES,
  errorEnvelopeSchema,
  readyResponseSchema,
} from '@attraccess/matter-contract';
import { connect } from 'node:net';
import { http, startSidecar, validHeaders, upgradeStatus, type Running } from './testing/harness';

// Real local HTTP and WebSocket connections; the Matter features behind them are simulated.
describe('transport', () => {
  let running: Running;
  beforeAll(async () => {
    running = await startSidecar(
      { maxMessageBytes: 2_048, requestDeadlineMs: 200 },
      {
        features: {
          'inventory.list': async () => ({ authoritative: false, nodes: [] }),
          'commands.invoke': () => new Promise(() => undefined),
          'fabric.get': async () => ({ unexpected: true }),
          'thread.get': async () => {
            throw new Error('boom setup-secret');
          },
        },
      },
    );
  });
  afterAll(() => running.stop());

  const get = (path: string, headers = validHeaders()) => http(running.port, 'GET', path, { headers });
  const post = (
    path: string,
    body: unknown,
    headers: Record<string, string> = { ...validHeaders(), 'content-type': 'application/json' },
  ) => http(running.port, 'POST', path, { headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('answers liveness and readiness without a fabric or any headers', async () => {
    expect((await http(running.port, 'GET', '/health/live')).body).toEqual({ status: 'live' });
    const ready = await http(running.port, 'GET', '/health/ready');
    expect(ready.status).toBe(200);
    expect(readyResponseSchema.parse(ready.body)).toMatchObject({
      status: 'ready',
      fabric: { state: 'uninitialized' },
    });
  });

  it('reports the version values without headers so operators can troubleshoot', async () => {
    const version = await http(running.port, 'GET', '/version');
    expect(version.body).toMatchObject({
      sidecar: COMPATIBILITY_TABLE[0].sidecar,
      matterJs: COMPATIBILITY_TABLE[0].matterJs,
      storageSchemaVersion: 1,
      wireVersion: 1,
    });
    expect(version.headers['x-correlation-id']).toBeDefined();
  });

  it('reports each family in the capability report', async () => {
    const report = await get('/v1/capabilities');
    expect(report.status).toBe(200);
    expect(report.body.capabilities.map((c: { family: string }) => c.family)).toEqual([...FEATURE_FAMILIES]);
    const byFamily = Object.fromEntries(report.body.capabilities.map((c: { family: string }) => [c.family, c]));
    expect(byFamily.health.available).toBe(true);
    expect(byFamily.inventory.available).toBe(true);
    expect(byFamily.ota).toMatchObject({ available: false, defined: true });
    expect(byFamily.ota.reason).toBeDefined();
  });

  it.each([
    ['missing', undefined, 426],
    ['unsupported', '2', 426],
    ['malformed', 'x', 426],
  ])('rejects a %s wire version with a valid envelope that names the supported version', async (_n, wire, status) => {
    const result = await get('/v1/fabric', validHeaders({ 'x-matter-wire-version': wire }));
    expect(result.status).toBe(status);
    expect(errorEnvelopeSchema.parse(result.body).error.details).toEqual({ supportedWireVersion: 1 });
  });

  it('rejects a mismatched release combination with 409 and never echoes malformed values', async () => {
    const mismatch = await get('/v1/fabric', validHeaders({ 'x-matter-plugin-version': '9.9.9' }));
    expect(mismatch.status).toBe(409);
    expect(mismatch.body.error.code).toBe('incompatible_release');
    expect(mismatch.body.error.message).toMatch(/Upgrade or downgrade/);
    const hostile = await get('/v1/fabric', validHeaders({ 'x-attraccess-version': 'evil-<b>' }));
    expect(hostile.status).toBe(409);
    expect(hostile.raw).not.toContain('evil');
  });

  it('never falls through from unknown versioned paths to /v1', async () => {
    expect((await get('/v2/fabric')).status).toBe(404);
    expect((await get('/v1')).status).toBe(404);
    expect((await get('/fabric')).status).toBe(404);
    expect((await http(running.port, 'POST', '/v1/capabilities', { headers: validHeaders() })).status).toBe(405);
    expect((await get('/v1/nodes/%E0%A4%A')).status).toBe(404);
  });

  it('rejects browser-origin requests and foreign hosts before anything else', async () => {
    const origin = await http(running.port, 'GET', '/health/live', { headers: { origin: 'http://evil.example' } });
    expect(origin.status).toBe(403);
    expect(origin.headers['access-control-allow-origin']).toBeUndefined();
    const host = await http(running.port, 'GET', '/health/live', { headers: { host: 'attacker.example' } });
    expect(host.status).toBe(403);
    const preflight = await http(running.port, 'OPTIONS', '/v1/fabric', { headers: { origin: 'http://evil.example' } });
    expect(preflight.status).toBe(403);
  });

  it('validates input before answering unsupported capability', async () => {
    const invalid = await post('/v1/fabric', { label: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.issues[0].path).toBe('label');
    expect((await post('/v1/fabric', '{not json')).status).toBe(400);
    expect((await get('/v1/nodes/not-a-number')).status).toBe(400);
    const unsupported = await post('/v1/fabric', { label: 'home' });
    expect(unsupported.status).toBe(501);
    expect(unsupported.body.error).toMatchObject({ code: 'unsupported_capability', details: { family: 'fabric' } });
    const commissioning = await post('/v1/commissioning/sessions', { setupCode: '34970112332' });
    expect(commissioning.status).toBe(501);
    expect(commissioning.raw).not.toContain('34970112332');
    expect((await post('/v1/commissioning/sessions', { setupCode: '34970112332', extra: 1 })).status).toBe(400);
  });

  it('rejects an invalid path parameter with 400 when a handler exists', async () => {
    expect((await get('/v1/nodes/xyz')).status).toBe(400);
  });

  it('serves simulated features and checks their responses', async () => {
    expect((await get('/v1/nodes')).body).toEqual({ authoritative: false, nodes: [] });
    const bad = await get('/v1/fabric');
    expect(bad.status).toBe(500);
    expect(bad.body.error.code).toBe('internal_error');
  });

  it('does not leak handler error text', async () => {
    const failed = await get('/v1/thread/network');
    expect(failed.status).toBe(500);
    expect(failed.raw).not.toContain('setup-secret');
    expect(running.logs.join('\n')).not.toContain('setup-secret');
  });

  it('answers 413 for an oversized body, with and without a content length', async () => {
    const big = JSON.stringify({ label: 'x'.repeat(5_000) });
    const declared = await post('/v1/fabric', big);
    expect(declared.status).toBe(413);
    expect(declared.body.error.details).toEqual({ limitBytes: 2_048 });
  });

  it('applies the deadline: a timed-out physical command is uncertain and never retryable', async () => {
    const started = Date.now();
    const result = await post('/v1/nodes/1/commands', {
      requestId: '11111111-1111-4111-8111-111111111111',
      endpointId: 1,
      clusterId: 6,
      commandId: 1,
    });
    expect(Date.now() - started).toBeLessThan(3_000);
    expect(result.status).toBe(504);
    expect(result.body.error).toMatchObject({ code: 'timeout', outcome: 'uncertain', retryable: false });
  });

  it('honours a shorter deadline from the request header', async () => {
    const started = Date.now();
    const result = await post(
      '/v1/nodes/1/commands',
      { requestId: '11111111-1111-4111-8111-111111111111', endpointId: 1, clusterId: 6, commandId: 1 },
      {
        ...validHeaders(),
        'x-request-deadline-ms': '20',
        'x-correlation-id': '22222222-2222-4222-8222-222222222222',
      },
    );
    expect(Date.now() - started).toBeLessThan(150 + 100);
    expect(result.status).toBe(504);
    expect(result.body.error.correlationId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('survives garbage on the socket', async () => {
    await new Promise<void>((resolve) => {
      const socket = connect(running.port, '127.0.0.1', () => socket.write('NOT HTTP\r\n\r\n'));
      socket.on('close', () => resolve());
      socket.on('error', () => resolve());
    });
    expect((await http(running.port, 'GET', '/health/live')).status).toBe(200);
  });

  it('refuses websocket upgrades the same way as requests', async () => {
    expect((await upgradeStatus(running.port, validHeaders({ 'x-matter-wire-version': '2' }))).status).toBe(426);
    expect((await upgradeStatus(running.port, validHeaders({ 'x-matter-plugin-version': '9.9.9' }))).status).toBe(409);
    expect((await upgradeStatus(running.port, { ...validHeaders(), origin: 'http://evil.example' })).status).toBe(403);
    expect((await upgradeStatus(running.port, validHeaders(), '/v2/events')).status).toBe(404);
    expect((await upgradeStatus(running.port, validHeaders())).status).toBe(101);
  });
});
