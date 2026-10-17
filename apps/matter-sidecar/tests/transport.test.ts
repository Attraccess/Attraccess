import { afterEach, describe, it, expect, vi } from 'vitest';
import { once } from 'node:events';
import { createServer, request } from 'node:http';
import { createConnection } from 'node:net';
import { WebSocket } from 'ws';
import { routes, ErrorEnvelope, INITIAL_CAPABILITIES, SUPPORTED_RELEASE } from '@attraccess/matter-contract';
import { fixtures, fixtureId, versionFixture } from '@attraccess/matter-contract/testing';
import { createApplication } from '../src/application.js';
import { checkCompatibility, ProtocolError } from '../src/errors.js';
import { attachClient } from '../src/websocket.js';
import { EventStream } from '../src/stream.js';
import { Config } from '../src/config.js';

const headers = fixtures.CompatibilityHeaders as Record<string, string>;
const apps: ReturnType<typeof createApplication>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.shutdown()));
});
async function start(config = {}, version = versionFixture) {
  const platform = { initialize: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
  const app = createApplication({ platform, version, config: { port: 0, shutdownMs: 100, ...config } });
  apps.push(app);
  return { app, platform, ...(await app.start()) };
}
async function waitFor(predicate: () => boolean) {
  const until = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > until) throw new Error('Transport did not reach expected state');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function connect(url: string) {
  const ws = new WebSocket(url.replace('http:', 'ws:') + '/v1/events', { headers });
  const messages: { type?: string; error?: { code: string }; [key: string]: unknown }[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await once(ws, 'open');
  return { ws, messages };
}
describe('real local HTTP and WebSocket transport with a simulated platform', () => {
  it.each(['999.0.0', '0.1.0+build.1', '0.1.0-rc.1+build.1', '0.1.0--rc.1', '0.1.0-0.a--b.1+001.a-b'])(
    'reports incompatible own release %s in diagnostics and rejects operations and upgrades',
    async (release) => {
      const version = {
        ...versionFixture,
        build: { ...versionFixture.build, version: release },
        sidecarRelease: release,
      };
      const { url } = await start({}, version);
      for (const path of ['/health/live', '/health/ready', '/version'])
        expect((await fetch(url + path)).status).toBe(200);
      expect(await (await fetch(url + '/version')).json()).toEqual(version);
      const verifyError = (body: unknown) => {
        const result = ErrorEnvelope.parse(body);
        expect(result.error.code).toBe('INCOMPATIBLE_RELEASE');
        expect(result.error.details.received).toMatchObject({ sidecar: release });
        expect(result.error.details.supported).toEqual([SUPPORTED_RELEASE]);
        expect(result.error.message).toMatch('Upgrade or downgrade');
      };
      for (const route of routes.filter((route) => route.path.startsWith('/v1/'))) {
        const response = await fetch(url + route.path, { method: route.method, headers });
        expect(response.status, route.path).toBe(409);
        verifyError(await response.json());
      }
      const ws = new WebSocket(url.replace('http:', 'ws:') + '/v1/events', { headers });
      ws.on('error', () => undefined);
      const response = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
        ws.once('open', () => {
          ws.terminate();
          reject(new Error('Incompatible sidecar accepted an upgrade'));
        });
        ws.once('unexpected-response', (_, res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.once('end', () => {
            ws.terminate();
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(body) });
          });
        });
      });
      expect(response.status).toBe(409);
      verifyError(response.body);
    },
  );
  it('contains a rejected upgrade socket reset and continues serving HTTP and WebSocket clients', async () => {
    const { app, port, url } = await start();
    const resetHandled = new Promise<void>((resolve) => {
      app.server.once('upgrade', (_, socket) => {
        // Deterministic fault injection after the real HTTP parser dispatches a
        // rejected upgrade. Before the fix this emit throws an unhandled error.
        socket.emit('error', Object.assign(new Error('Connection reset'), { code: 'ECONNRESET' }));
        expect(socket.destroyed).toBe(true);
        resolve();
      });
    });
    const client = createConnection({ port, host: '127.0.0.1' });
    client.on('error', () => undefined);
    client.resume();
    const closed = once(client, 'close');
    await once(client, 'connect');
    client.write('GET /v2/events HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    await resetHandled;
    await closed;
    expect((await fetch(url + '/health/live')).status).toBe(200);
    const { ws } = await connect(url);
    ws.close();
    await once(ws, 'close');
  });
  it('uses the shared subscription interval validation before capability checks', async () => {
    const { url } = await start();
    for (const [minIntervalSeconds, maxIntervalSeconds, status] of [
      [100, 1, 400],
      [100, 100, 501],
    ]) {
      const response = await fetch(url + '/v1/subscriptions', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ ...(fixtures.SubscriptionRequest as object), minIntervalSeconds, maxIntervalSeconds }),
      });
      expect(response.status).toBe(status);
    }
  });
  it('reports ready without a fabric, validates requests and advertises unavailable features', async () => {
    const { app, platform, url } = await start();
    expect(await (await fetch(url + '/health/live')).json()).toEqual({ schemaVersion: 1, live: true });
    expect(await (await fetch(url + '/health/ready')).json()).toEqual({
      schemaVersion: 1,
      ready: true,
      fabricInitialized: false,
      reason: null,
    });
    expect(await (await fetch(url + '/version')).json()).toEqual(versionFixture);
    expect(await (await fetch(url + '/v1/capabilities', { headers })).json()).toEqual(INITIAL_CAPABILITIES);
    for (const route of routes.filter((route) => 'capability' in route)) {
      const body = 'request' in route ? JSON.stringify(fixtures[route.request]) : undefined;
      const response = await fetch(url + route.path, {
        method: route.method,
        headers: { ...headers, 'content-type': 'application/json' },
        body,
      });
      expect(response.status, route.path).toBe(501);
      const result = ErrorEnvelope.parse(await response.json());
      expect(result.error.details.capability).toBe(route.capability);
      if ('request' in route)
        expect(
          (
            await fetch(url + route.path, {
              method: 'POST',
              headers: { ...headers, 'content-type': 'application/json' },
              body: '{"password":"do-not-echo"}',
            })
          ).status,
        ).toBe(400);
    }
    await app.shutdown();
    expect(app.ready).toBe(false);
    expect(platform.dispose).toHaveBeenCalledOnce();
    await app.shutdown();
    expect(platform.dispose).toHaveBeenCalledOnce();
  });
  it('rejects each release mismatch, absent metadata, unknown wire routes and browser Origins', async () => {
    const { url } = await start();
    for (const key of ['x-attraccess-version', 'x-matter-plugin-version']) {
      for (const value of ['999.0.0', 'bad version', undefined]) {
        const invalid = { ...headers };
        if (value === undefined) delete invalid[key];
        else invalid[key] = value;
        const response = await fetch(url + '/v1/capabilities', { headers: invalid });
        expect(response.status).toBe(409);
        const result = ErrorEnvelope.parse(await response.json());
        expect(result.error.details.supported).toEqual([SUPPORTED_RELEASE]);
        expect(result.error.message).toMatch('Upgrade or downgrade');
      }
    }
    expect(() => checkCompatibility(headers, '999.0.0')).toThrow('Upgrade or downgrade');
    expect(() => checkCompatibility(headers, 'not-a-version')).toThrow('Upgrade or downgrade');
    expect(
      (await fetch(url + '/v1/capabilities', { headers: { ...headers, 'x-matter-wire-version': '2' } })).status,
    ).toBe(426);
    expect((await fetch(url + '/v2/capabilities', { headers })).status).toBe(426);
    expect((await fetch(url + '/health/live', { headers: { Origin: 'http://example.org' } })).status).toBe(403);
    const missing = { ...headers };
    delete missing['x-request-id'];
    expect((await fetch(url + '/v1/capabilities', { headers: missing })).status).toBe(400);
    expect((await fetch(url + '/health/live')).status).toBe(200);
    for (const invalid of [
      { ...headers, 'x-matter-plugin-version': '999.0.0' },
      { ...headers, 'x-matter-wire-version': '2' },
      { ...headers, Origin: 'http://example.org' },
    ]) {
      const ws = new WebSocket(url.replace('http:', 'ws:') + '/v1/events', { headers: invalid });
      const response = new Promise<number>((resolve) =>
        ws.once('unexpected-response', (_, res) => {
          res.resume();
          ws.terminate();
          resolve(res.statusCode ?? 0);
        }),
      );
      ws.on('error', () => undefined);
      expect(await response).toBe(
        'Origin' in invalid
          ? 403
          : 'x-matter-wire-version' in invalid && invalid['x-matter-wire-version'] === '2'
            ? 426
            : 409,
      );
    }
  });
  it('redacts malformed releases in HTTP and rejected upgrade errors while preserving valid mismatches', async () => {
    const { url } = await start();
    for (const [header, component] of [
      ['x-attraccess-version', 'attraccess'],
      ['x-matter-plugin-version', 'plugin'],
    ]) {
      for (const value of [
        'password=review-only-secret',
        '999.0.0',
        '999.0.0-rc.1',
        '999.0.0--rc.1',
        '999.0.0-0.a--b.1+001.a-b',
        '999.0.0+build.1',
        '1'.repeat(101),
        undefined,
      ]) {
        const invalid = { ...headers };
        if (value === undefined) delete invalid[header];
        else invalid[header] = value;
        const expected = value?.startsWith('999.') ? value : null;
        const http = await fetch(url + '/v1/capabilities', { headers: invalid });
        expect(http.status).toBe(409);
        const httpBody = await http.text();
        const ws = new WebSocket(url.replace('http:', 'ws:') + '/v1/events', { headers: invalid });
        ws.on('error', () => undefined);
        const upgradeBody = await new Promise<string>((resolve) => {
          ws.once('unexpected-response', (_, response) => {
            expect(response.statusCode).toBe(409);
            let body = '';
            response.on('data', (bytes) => (body += bytes.toString()));
            response.on('end', () => {
              ws.terminate();
              resolve(body);
            });
          });
        });
        for (const body of [httpBody, upgradeBody]) {
          const result = ErrorEnvelope.parse(JSON.parse(body));
          expect(result.error.code).toBe('INCOMPATIBLE_RELEASE');
          expect(result.error.details.received).toEqual({ ...SUPPORTED_RELEASE, [component]: expected });
          expect(result.error.details.supported).toEqual([SUPPORTED_RELEASE]);
          expect(result.error.message).toContain('Upgrade or downgrade');
          expect(body).not.toContain('review-only-secret');
        }
      }
    }
    for (const [release, expected] of [
      ['password=review-only-secret', null],
      ['999.0.0', '999.0.0'],
    ] as const) {
      try {
        checkCompatibility(headers, release);
        throw new Error('Expected a release rejection');
      } catch (error) {
        if (!(error instanceof ProtocolError)) throw error;
        expect(error.envelope(fixtureId).error.details.received).toEqual({ ...SUPPORTED_RELEASE, sidecar: expected });
      }
    }
  });
  it('replays stable events, switches to live delivery, and repeats reconnect cursors safely', async () => {
    const { app, url } = await start();
    const cursor = app.stream.watermark;
    const first = app.stream.publish({ type: 'lifecycle', payload: { state: 'ready' } });
    const { ws, messages } = await connect(url);
    ws.send(JSON.stringify({ schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor }));
    await waitFor(() => messages.length === 2);
    const live = app.stream.publish({ type: 'lifecycle', payload: { state: 'ready' } });
    await waitFor(() => messages.length === 3);
    expect(messages[0]).toEqual(first);
    expect(messages[1].type).toBe('stream.ready');
    expect(messages[2]).toEqual(live);
    ws.close();
    await once(ws, 'close');
    const again = await connect(url);
    again.ws.send(JSON.stringify({ schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor }));
    await waitFor(() => again.messages.length === 3);
    expect(again.messages.slice(0, 2)).toEqual([first, live]);
    again.ws.close();
  });
  it('sends initial lifecycle/capability events through the standard envelope and rejects stream gaps', async () => {
    const { app, url } = await start();
    const initial = await connect(url);
    initial.ws.send(
      JSON.stringify({
        schemaVersion: 1,
        type: 'resume',
        requestId: fixtureId,
        cursor: { streamInstanceId: app.stream.instanceId, sequence: 0 },
      }),
    );
    await waitFor(() => initial.messages.length === 3);
    expect(initial.messages.map((m) => m.type)).toEqual(['lifecycle', 'capabilities', 'stream.ready']);
    initial.ws.close();
    for (const value of [
      { schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor: { streamInstanceId: fixtureId, sequence: 0 } },
      { schemaVersion: 2, type: 'resume', requestId: fixtureId, cursor: null },
      { schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor: 'bad' },
      'invalid-json',
    ]) {
      const client = await connect(url);
      client.ws.send(typeof value === 'string' ? value : JSON.stringify(value));
      await once(client.ws, 'close');
      expect(client.messages[0].error).toBeDefined();
      expect([409, 426, 400]).toContain(
        { RECONCILIATION_REQUIRED: 409, UNSUPPORTED_WIRE_VERSION: 426, VALIDATION_ERROR: 400 }[
          client.messages[0].error?.code as 'VALIDATION_ERROR'
        ],
      );
    }
  });
  it.each([
    { schemaVersion: 2, cursor: null },
    { schemaVersion: 1, cursor: 'bad' },
  ])('correlates rejected messages with their valid request ID: %j', async (fields) => {
    const { url } = await start();
    const client = await connect(url);
    const requestId = '11111111-1111-4111-8111-111111111111';
    client.ws.send(JSON.stringify({ type: 'resume', requestId, ...fields }));
    await once(client.ws, 'close');
    expect(ErrorEnvelope.parse(client.messages[0]).error.requestId).toBe(requestId);
  });
  it.each([undefined, null, 'invalid-id', { secret: 'must not be reflected' }])(
    'retains connection correlation when a rejected message has an invalid request ID: %j',
    async (requestId) => {
      const { url } = await start();
      const client = await connect(url);
      client.ws.send(JSON.stringify({ schemaVersion: 1, type: 'resume', requestId, cursor: 'bad' }));
      await once(client.ws, 'close');
      expect(ErrorEnvelope.parse(client.messages[0]).error.requestId).toBe(headers['x-request-id']);
    },
  );
  it('validates message versions after initial subscription and closes idle streams', async () => {
    const { url } = await start({ resumeTimeoutMs: 50 });
    const client = await connect(url);
    client.ws.send(JSON.stringify({ schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor: null }));
    await waitFor(() => client.messages.length === 1);
    client.ws.send(JSON.stringify({ schemaVersion: 2, type: 'resume', requestId: fixtureId, cursor: null }));
    await once(client.ws, 'close');
    expect(client.messages[1].error?.code).toBe('UNSUPPORTED_WIRE_VERSION');
    const idle = await connect(url);
    await once(idle.ws, 'close');
    expect(idle.messages[0].error?.code).toBe('TIMEOUT');
  });
  it('bounds slow clients using the real connection writer with deterministic queue pressure', () => {
    const stream = new EventStream();
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const ws = {
      readyState: WebSocket.OPEN,
      bufferedAmount: 10000,
      on: (name: string, fn: (...args: unknown[]) => void) => (handlers[name] = fn),
      once: (name: string, fn: (...args: unknown[]) => void) => {
        const previous = handlers[name];
        handlers[name] = (...args) => {
          previous?.(...args);
          fn(...args);
        };
      },
      send: vi.fn(),
      close: vi.fn(),
      terminate: vi.fn(),
    };
    attachClient(ws as unknown as WebSocket, fixtureId, stream, Config.parse({ clientQueueBytes: 128 }));
    handlers.message(
      Buffer.from(JSON.stringify({ schemaVersion: 1, type: 'resume', requestId: fixtureId, cursor: null })),
      false,
    );
    expect(ws.close).toHaveBeenCalledWith(4009, expect.stringContaining('Reconciliation'));
    expect(ws.send).not.toHaveBeenCalled();
    handlers.close();
  });
  it.each([
    { bufferedAmount: 0, clientQueueBytes: 128, overflow: true },
    { bufferedAmount: 400, clientQueueBytes: 512, overflow: true },
    { bufferedAmount: 100, clientQueueBytes: 512, overflow: false },
    { bufferedAmount: 100, clientQueueBytes: 'exact', overflow: false },
  ] as const)('bounds error delivery with queue pressure $bufferedAmount/$clientQueueBytes', (testCase) => {
    vi.useFakeTimers();
    try {
      const handlers: Record<string, (...args: unknown[]) => void> = {};
      const ws = {
        readyState: WebSocket.OPEN,
        bufferedAmount: testCase.bufferedAmount,
        on: (name: string, fn: (...args: unknown[]) => void) => (handlers[name] = fn),
        once: (name: string, fn: (...args: unknown[]) => void) => {
          const previous = handlers[name];
          handlers[name] = (...args) => {
            previous?.(...args);
            fn(...args);
          };
        },
        send: vi.fn((data: string) => (ws.bufferedAmount += Buffer.byteLength(data))),
        close: vi.fn(),
        terminate: vi.fn(),
      };
      const errorBytes = Buffer.byteLength(
        JSON.stringify(new ProtocolError('VALIDATION_ERROR', 'Malformed JSON WebSocket message.').envelope(fixtureId)),
      );
      const clientQueueBytes =
        testCase.clientQueueBytes === 'exact' ? testCase.bufferedAmount + errorBytes : testCase.clientQueueBytes;
      attachClient(
        ws as unknown as WebSocket,
        fixtureId,
        new EventStream(),
        Config.parse({ clientQueueBytes, shutdownMs: 100 }),
      );
      handlers.message(Buffer.from('invalid-json'), false);
      expect(ws.bufferedAmount).toBeLessThanOrEqual(clientQueueBytes);
      if (testCase.overflow) {
        expect(ws.send).not.toHaveBeenCalled();
        expect(ws.close).toHaveBeenCalledWith(4009, 'Reconciliation required: snapshots unavailable');
      } else {
        expect(ws.send).toHaveBeenCalledOnce();
        expect(ErrorEnvelope.parse(JSON.parse(ws.send.mock.calls[0][0])).error.code).toBe('VALIDATION_ERROR');
        expect(ws.close).toHaveBeenCalledWith(4009, 'VALIDATION_ERROR');
      }
      handlers.message(Buffer.from('invalid-json'), false);
      expect(ws.close).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(100);
      expect(ws.terminate).toHaveBeenCalledOnce();
      handlers.close();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it('closes a real WebSocket with reconciliation guidance when its error cannot fit', async () => {
    const { url } = await start({ clientQueueBytes: 128 });
    const { ws, messages } = await connect(url);
    const closed = once(ws, 'close');
    ws.send('invalid-json');
    const [code, reason] = await closed;
    expect(code).toBe(4009);
    expect(reason.toString()).toBe('Reconciliation required: snapshots unavailable');
    expect(messages).toEqual([]);
  });
  it.each(['text', 'binary', 'fragmented'])(
    'rejects oversized %s WebSocket messages with a safe parser close',
    async (kind) => {
      const { url } = await start({ payloadBytes: 512 });
      const client = await connect(url);
      const closed = once(client.ws, 'close');
      const sensitive = 'request-only-secret-'.repeat(40);
      if (kind === 'fragmented') {
        // Both fragments fit individually; the aggregate message must still be bounded.
        client.ws.send(sensitive.slice(0, 400), { fin: false });
        client.ws.send(sensitive.slice(400), { fin: true });
      } else client.ws.send(kind === 'binary' ? Buffer.from(sensitive) : sensitive);
      const [code, reason] = await closed;
      expect(code).toBe(1009);
      expect(reason.toString()).toBe('');
      expect(client.messages).toEqual([]);
      expect((await fetch(url + '/health/live')).status).toBe(200);
    },
  );
  it('validates a WebSocket message at the exact payload limit with a structured application error', async () => {
    const { url } = await start({ payloadBytes: 512 });
    const client = await connect(url);
    const closed = once(client.ws, 'close');
    client.ws.send('x'.repeat(512));
    const [code] = await closed;
    expect(code).toBe(4009);
    expect(client.messages).toHaveLength(1);
    const error = ErrorEnvelope.parse(client.messages[0]);
    expect(error.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(error)).not.toContain('x'.repeat(512));
  });
  it('rejects chunked oversized REST uploads', async () => {
    const { url } = await start({ payloadBytes: 512 });
    const oversized = await new Promise<number>((resolve, reject) => {
      const req = request(
        url + '/v1/commissioning/start',
        { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
        (res) => {
          res.resume();
          res.on('end', () => {
            req.destroy();
            resolve(res.statusCode ?? 0);
          });
        },
      );
      req.on('error', reject);
      req.write('x'.repeat(1024));
    });
    expect(oversized).toBe(413);
    expect((await fetch(url + '/health/live')).status).toBe(200);
  });
  it('marks readiness false while draining an in-flight HTTP upload', async () => {
    const { app, port } = await start({ shutdownMs: 500 });
    const socket = createConnection({ host: '127.0.0.1', port });
    await once(socket, 'connect');
    let output = '';
    socket.on('data', (data) => (output += data.toString()));
    const closed = once(socket, 'close');
    const received = once(app.server, 'request');
    socket.write(
      `POST /v1/commands HTTP/1.1\r\nHost: localhost\r\n${Object.entries(headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\r\n')}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{`,
    );
    await received;
    const shutdown = app.shutdown();
    expect(app.ready).toBe(false);
    expect(Reflect.get(app.stream, 'expirationTimer')).toBeUndefined();
    expect(Reflect.get(app.stream, 'buffer')).toHaveLength(0);
    socket.write('}GET /health/ready HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
    await closed;
    await shutdown;
    expect(output).toContain('503');
    expect(output).toContain('"ready":false');
    expect(output).toContain('"fabricInitialized":false');
  });
  it('contains initialization failures, rejects remote bind, and bounds disposal', async () => {
    expect(() => Config.parse({ host: '0.0.0.0' })).toThrow();
    const platform = {
      initialize: vi.fn(async () => {
        throw new Error('simulated initialization failure');
      }),
      dispose: vi.fn(async () => undefined),
    };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0, shutdownMs: 30 } });
    await expect(app.start()).rejects.toThrow('simulated initialization failure');
    expect(app.ready).toBe(false);
    expect(platform.dispose).toHaveBeenCalledOnce();
    const bounded = await start({ shutdownMs: 30 });
    bounded.platform.dispose.mockImplementation(() => new Promise(() => undefined));
    const before = Date.now();
    await bounded.app.shutdown();
    expect(Date.now() - before).toBeLessThan(200);
  });
  it.each([false, true])('cleans resources acquired during shutdown (after deadline: %s)', async (afterDeadline) => {
    vi.useFakeTimers();
    let finishInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => (finishInitialization = resolve));
    let enteredInitialization!: () => void;
    const entered = new Promise<void>((resolve) => (enteredInitialization = resolve));
    let acquired = false;
    const order: string[] = [];
    const platform = {
      initialize: vi.fn(async () => {
        enteredInitialization();
        await initialization;
        acquired = true;
        order.push('acquired');
      }),
      dispose: vi.fn(async () => {
        acquired = false;
        order.push('disposed');
      }),
    };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0, shutdownMs: 30 } });
    apps.push(app);
    const starting = expect(app.start()).rejects.toThrow('Shutdown began during initialization.');
    try {
      await entered;
      const stopping = app.shutdown();
      expect(app.shutdown()).toBe(stopping);
      expect(platform.dispose).not.toHaveBeenCalled();
      if (afterDeadline) {
        await vi.advanceTimersByTimeAsync(30);
        await stopping;
        expect(platform.dispose).not.toHaveBeenCalled();
      }
      finishInitialization();
      await starting;
      await stopping;
      expect(order).toEqual(['acquired', 'disposed']);
      expect(acquired).toBe(false);
      expect(platform.dispose).toHaveBeenCalledOnce();
      expect(app.ready).toBe(false);
      expect(app.server.listening).toBe(false);
      expect(Reflect.get(app.stream, 'expirationTimer')).toBeUndefined();
      expect(Reflect.get(app.stream, 'buffer')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      finishInitialization();
      vi.useRealTimers();
    }
  });
  it('cleans partial acquisition when pending initialization fails during shutdown', async () => {
    let finishInitialization!: () => void;
    const initialization = new Promise<void>((resolve) => (finishInitialization = resolve));
    let acquired = false;
    const platform = {
      initialize: vi.fn(async () => {
        await initialization;
        acquired = true;
        throw new Error('simulated late initialization failure');
      }),
      dispose: vi.fn(async () => {
        acquired = false;
      }),
    };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0, shutdownMs: 100 } });
    apps.push(app);
    const starting = expect(app.start()).rejects.toThrow('simulated late initialization failure');
    const stopping = app.shutdown();
    finishInitialization();
    await Promise.all([starting, stopping]);
    expect(acquired).toBe(false);
    expect(platform.dispose).toHaveBeenCalledOnce();
    expect(app.ready).toBe(false);
    expect(app.server.listening).toBe(false);
  });
  it('keeps readiness false when shutdown begins at the listening event', async () => {
    const platform = { initialize: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0, shutdownMs: 100 } });
    apps.push(app);
    let stopping: Promise<void> | undefined;
    app.server.once('listening', () => (stopping = app.shutdown()));
    await expect(app.start()).rejects.toThrow('Shutdown began while starting the listener.');
    await stopping;
    expect(app.ready).toBe(false);
    expect(app.server.listening).toBe(false);
    expect(platform.dispose).toHaveBeenCalledOnce();
    expect(Reflect.get(app.stream, 'buffer')).toHaveLength(0);
    expect(Reflect.get(app.stream, 'expirationTimer')).toBeUndefined();
  });
  it.each([3, 4, 8])('cancels pending HTTP binding when shutdown follows %s microtasks', async (depth) => {
    let stopping: Promise<void> | undefined;
    let listeningWhenShutdown: boolean | undefined;
    const platform = {
      initialize: vi.fn(async () => {
        let remaining = depth;
        const stop = () => {
          if (remaining-- > 0) queueMicrotask(stop);
          else {
            listeningWhenShutdown = app.server.listening;
            stopping = app.shutdown();
          }
        };
        queueMicrotask(stop);
      }),
      dispose: vi.fn(async () => undefined),
    };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0, shutdownMs: 100 } });
    apps.push(app);
    // The spy observes calls without replacing Node's asynchronous bind behavior.
    const listen = vi.spyOn(app.server, 'listen');
    const listening = vi.fn();
    app.server.on('listening', listening);
    try {
      await expect(app.start()).rejects.toThrow('Shutdown began while starting the listener.');
      await stopping;
      // Let pending Node callbacks run, so a listener opening after shutdown fails.
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(listen).toHaveBeenCalledOnce();
      expect(listeningWhenShutdown).toBe(false);
      expect(listening).not.toHaveBeenCalled();
      expect(app.ready).toBe(false);
      expect(app.server.listening).toBe(false);
      expect(app.server.address()).toBeNull();
      expect(platform.dispose).toHaveBeenCalledOnce();
      expect(Reflect.get(app.stream, 'buffer')).toHaveLength(0);
      expect(Reflect.get(app.stream, 'expirationTimer')).toBeUndefined();
    } finally {
      listen.mockRestore();
      // Also clean up the leaked listener when this regression is run before the fix.
      if (app.server.listening) await new Promise<void>((resolve) => app.server.close(() => resolve()));
    }
  });
  it('preserves bind failures and cleans initialized resources', async () => {
    const occupied = createServer();
    occupied.listen(0, '127.0.0.1');
    await once(occupied, 'listening');
    const address = occupied.address();
    if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
    const platform = { initialize: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    const app = createApplication({
      platform,
      version: versionFixture,
      config: { port: address.port, shutdownMs: 100 },
    });
    apps.push(app);
    try {
      await expect(app.start()).rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(app.ready).toBe(false);
      expect(app.server.listening).toBe(false);
      expect(platform.dispose).toHaveBeenCalledOnce();
    } finally {
      await new Promise<void>((resolve) => occupied.close(() => resolve()));
    }
  });
  it('does not acquire resources when started after shutdown', async () => {
    const platform = { initialize: vi.fn(async () => undefined), dispose: vi.fn(async () => undefined) };
    const app = createApplication({ platform, version: versionFixture, config: { port: 0 } });
    apps.push(app);
    await app.shutdown();
    await expect(app.start()).rejects.toThrow('Application is already started or shutting down.');
    expect(platform.initialize).not.toHaveBeenCalled();
    expect(platform.dispose).not.toHaveBeenCalled();
    expect(app.ready).toBe(false);
    expect(app.server.listening).toBe(false);
  });
  it('returns deadlines and bounded-payload errors without echoing sensitive requests', async () => {
    const { url } = await start({ payloadBytes: 512, requestTimeoutMs: 100 });
    const body = { ...(fixtures.CommandRequest as object), deadline: '2000-01-01T00:00:00.000Z' };
    const response = await fetch(url + '/v1/commands', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(504);
    const invalid = await fetch(url + '/v1/commissioning/start', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: '{"password":"never-echo-this"}',
    });
    expect(await invalid.text()).not.toContain('never-echo-this');
    const oversize = await fetch(url + '/v1/commissioning/start', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'a'.repeat(1024) }),
    });
    expect(oversize.status).toBe(413);
    const stalled = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        url + '/v1/commands',
        { method: 'POST', headers: { ...headers, 'content-type': 'application/json', 'transfer-encoding': 'chunked' } },
        (res) => {
          let text = '';
          res.on('data', (data) => (text += data));
          res.on('end', () => {
            req.destroy();
            resolve({ status: res.statusCode ?? 0, body: text });
          });
        },
      );
      req.on('error', reject);
      req.write('{');
    });
    expect(stalled.status).toBe(504);
    expect(JSON.parse(stalled.body).error.code).toBe('TIMEOUT');
    expect((await fetch(url + '/health/live')).status).toBe(200);
  });
});
