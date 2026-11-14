import {
  CLOSE_CODES,
  FEATURE_FAMILIES,
  UNAUTHORIZED_MESSAGE,
  type CapabilityReport,
} from '@attraccess/matter-contract';
import { randomUUID } from 'node:crypto';
import { selfSignedCertificate } from '../testing/certs';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar.test-utils';
import { SidecarConnection, type ConnectionStatus } from './connection';
import { SidecarAbortedError, SidecarUnavailableError } from './errors';
import { BACKOFF_CAP_MS } from './backoff';
import { SidecarHttpClient } from './rest-client';

async function until(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('SidecarConnection', () => {
  let fake: FakeSidecar | undefined;
  let connection: SidecarConnection;
  let logs: string[];
  const states: ConnectionStatus[] = [];

  const create = (overrides: Partial<ConstructorParameters<typeof SidecarConnection>[0]> = {}) => {
    connection = new SidecarConnection({
      hostVersion: HOST_VERSION,
      pluginVersion: entry.plugin,
      logger: { debug: (m) => logs.push(`debug: ${m}`), warn: (m) => logs.push(`warn: ${m}`) },
      random: () => 0,
      ...overrides,
    });
    connection.onStateChange((status) => states.push(status));
    return connection;
  };

  beforeEach(() => {
    logs = [];
    states.length = 0;
  });
  afterEach(async () => {
    connection?.stop();
    await fake?.stop();
    fake = undefined;
  });

  it('starts as not configured and stays that way without settings', () => {
    create().configure(null);
    expect(connection.status()).toMatchObject({
      state: 'not_configured',
      reason: null,
      nextRetryAt: null,
      sidecar: null,
    });
  });

  it('connects, reports the sidecar versions and capabilities, and a stable since', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    expect(connection.status().state).toBe('connecting');
    await until(() => connection.status().state === 'connected');
    const status = connection.status();
    expect(status).toMatchObject({
      reason: null,
      wireVersion: 1,
      insecureTransport: false,
      lastError: null,
      sidecar: { sidecar: entry.sidecar, matterJs: entry.matterJs, wireVersion: 1 },
    });
    expect(status.capabilities?.capabilities).toHaveLength(FEATURE_FAMILIES.length);
    expect(status.supported).toEqual([entry]);
    expect(states.map((s) => s.state)).toEqual(['connecting', 'connected']);
  });

  it('connects through a reverse-proxy path prefix for REST and for the event stream', async () => {
    fake = await FakeSidecar.start({ prefix: '/matter' });
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    expect(fake.requests.map((request) => request.path)).toEqual(['/version', '/v1/capabilities']);
    expect(fake.requests.every((request) => request.prefixed)).toBe(true);
    expect(fake.upgrades).toMatchObject([{ path: '/v1/events', prefixed: true }]);
    expect(fake.sockets.size).toBe(1);
  });

  it('flags plain http to a non-loopback host as insecure transport', () => {
    create().configure({ url: 'http://matter.example.com:8581', token: TOKEN });
    expect(connection.status().insecureTransport).toBe(true);
  });

  it('serves typed requests only while connected, and never retries them', async () => {
    fake = await FakeSidecar.start();
    create();
    await expect(connection.request('health.capabilities')).rejects.toBeInstanceOf(SidecarUnavailableError);
    connection.configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    const before = fake.requests.length;
    await expect(connection.request('health.capabilities')).resolves.toMatchObject({ capabilities: expect.any(Array) });
    expect(fake.requests.length).toBe(before + 1);
    fake.restOverride = (_req, res) => void res.writeHead(503).end();
    await expect(connection.request('health.capabilities')).rejects.toBeInstanceOf(SidecarUnavailableError);
    expect(fake.requests.length).toBe(before + 2);
  });

  it('is degraded/unavailable with a next retry when the sidecar is absent, and recovers by itself', async () => {
    fake = await FakeSidecar.start();
    const { port } = fake;
    await fake.stop();
    create().configure({ url: `http://127.0.0.1:${port}`, token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    const status = connection.status();
    expect(status).toMatchObject({ reason: 'unavailable', lastError: { code: 'network' } });
    expect(status.nextRetryAt).not.toBeNull();
    fake = await FakeSidecar.start({ port });
    await until(() => connection.status().state === 'connected');
    expect(connection.status()).toMatchObject({ reason: null, lastError: null, nextRetryAt: null });
  });

  it('goes degraded/unavailable when a connected sidecar is killed, then resumes with the last cursor', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    const received: string[] = [];
    connection.onEvent(({ cursor }) => received.push(cursor));
    fake.broadcast(fake.nextEvent());
    fake.broadcast(fake.nextEvent());
    await until(() => received.length === 2);
    fake.killSockets();
    await until(() => connection.status().state === 'degraded');
    expect(connection.status().reason).toBe('unavailable');
    await until(() => connection.status().state === 'connected');
    await until(() => fake?.resumes.length === 2);
    expect(fake.resumes[1].cursor).toBe(received[1]);
  });

  it('keeps the cursor across a settings change, so events published meanwhile are replayed', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    const received: string[] = [];
    const signals: string[] = [];
    connection.onEvent(({ cursor }) => received.push(cursor));
    connection.onReconciliationRequired((reason) => signals.push(reason));
    fake.broadcast(fake.nextEvent());
    await until(() => received.length === 1);
    connection.configure({ url: `${fake.url}/`, token: TOKEN, caCertificate: null });
    await until(() => fake?.resumes.length === 2);
    expect(fake.resumes[1].cursor).toBe(received[0]);
    await until(() => connection.status().state === 'connected');
    expect(signals).toEqual([]);
  });

  it('backs off on repeated slow-client closes (1013) without cutting off requests in flight', async () => {
    fake = await FakeSidecar.start();
    create({ random: () => 0.5 }).configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    fake.restOverride = (req) => (req.url === '/v1/fabric' ? undefined : 'pass'); // fabric.get never answers
    let settled = false;
    const inFlight = connection.request('fabric.get');
    void inFlight.catch(() => undefined).finally(() => (settled = true));
    for (const socket of fake.sockets) socket.close(CLOSE_CODES.tryAgainLater, 'slow');
    await until(() => logs.some((line) => line.includes('reconnecting in 500 ms')));
    await until(() => connection.status().state === 'connected' && fake?.sockets.size === 1);
    for (const socket of fake.sockets) socket.close(CLOSE_CODES.tryAgainLater, 'slow');
    await until(() => logs.some((line) => line.includes('reconnecting in 1000 ms')));
    await until(() => connection.status().state === 'connected');
    expect(fake.resumes.at(-1)?.cursor).toBeUndefined(); // no events yet, so nothing to resume from
    // Only the event stream reconnected: the REST request is still waiting, and stop() still aborts it.
    expect(settled).toBe(false);
    connection.stop();
    await expect(inFlight).rejects.toBeInstanceOf(SidecarAbortedError);
  });

  it('reports a physical request that may have reached the sidecar as uncertain', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    fake.restOverride = (req) => void req.socket.destroy();
    const before = fake.requests.length;
    const failure = await connection
      .request('fabric.create', { body: { label: 'Makerspace' } })
      .catch((error) => error);
    expect(failure).toMatchObject({ kind: 'unavailable', retryable: false, outcome: 'uncertain' });
    expect(fake.requests.length).toBe(before + 1);
  });

  it('types requests from the contract', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    const report: CapabilityReport = await connection.request('health.capabilities');
    expect(report.capabilities).toHaveLength(FEATURE_FAMILIES.length);
    // @ts-expect-error /version does not answer with a capability report
    const wrong: () => Promise<CapabilityReport> = () => connection.request('health.version');
    // @ts-expect-error fabric.create needs a body
    const missing = () => connection.request('fabric.create', {});
    expect([typeof wrong, typeof missing]).toEqual(['function', 'function']);
  });

  it('raises the reconciliation signal to subscribers on a sequence gap and reconnects fresh', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    const signals: string[] = [];
    connection.onReconciliationRequired((reason) => signals.push(reason));
    fake.broadcast(fake.nextEvent());
    fake.broadcast(fake.eventAt(9));
    await until(() => signals.length === 1);
    expect(signals).toEqual(['sequence-gap']);
    await until(() => fake?.resumes.length === 2);
    expect(fake.resumes[1].cursor).toBeUndefined();
    await until(() => connection.status().state === 'connected');
  });

  it('is degraded/unauthorized for a rejected credential and retries at the cap', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    const status = connection.status();
    expect(status).toMatchObject({ reason: 'unauthorized', lastError: { code: 'unauthorized' } });
    expect(Date.parse(status.nextRetryAt as string) - Date.now()).toBeGreaterThan(BACKOFF_CAP_MS - 2_000);
  });

  it('passes the sidecar 401 hint through intact and masks any real bearer value', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().reason === 'unauthorized');
    expect(connection.status().lastError?.message).toBe(UNAUTHORIZED_MESSAGE);
    fake.restOverride = (_req, res) => {
      const body = JSON.stringify({
        error: {
          code: 'unauthorized',
          message: `${UNAUTHORIZED_MESSAGE} rejected Bearer hunter2hunter2hunter2 here`,
          correlationId: randomUUID(),
          retryable: false,
        },
      });
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(body);
    };
    connection.configure({ url: fake.url, token: `${TOKEN}-changed` });
    await until(() => connection.status().lastError?.message.includes('here') === true);
    expect(connection.status().lastError?.message).toBe(`${UNAUTHORIZED_MESSAGE} rejected Bearer [redacted] here`);
  });

  it('reconnects immediately when the settings change', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().reason === 'unauthorized');
    fake.tokens = [TOKEN];
    const changedAt = Date.now();
    connection.configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    expect(Date.now() - changedAt).toBeLessThan(2_000);
    connection.configure(null);
    expect(connection.status().state).toBe('not_configured');
    await until(() => fake?.sockets.size === 0);
  });

  it.each([['a different sidecar release', { sidecarVersion: '9.9.9' }]])(
    'is degraded/incompatible for %s, with received and supported combinations',
    async (_name, options) => {
      fake = await FakeSidecar.start(options);
      create().configure({ url: fake.url, token: TOKEN });
      await until(() => connection.status().state === 'degraded');
      const status = connection.status();
      expect(status.reason).toBe('incompatible');
      expect(status.lastError?.details).toMatchObject({
        received: { sidecar: '9.9.9', plugin: entry.plugin, attraccess: HOST_VERSION },
        supported: [entry],
      });
    },
  );

  it('is degraded/incompatible, without contacting the sidecar, when the host version is unavailable', async () => {
    fake = await FakeSidecar.start();
    create({ hostVersion: undefined }).configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    expect(connection.status()).toMatchObject({ reason: 'incompatible', reasonDetail: 'host version unavailable' });
    expect(fake.requests).toHaveLength(0);
  });

  it.each([
    ['a host not in the table', { hostVersion: '1.10.0', pluginVersion: entry.plugin }],
    ['a plugin release not in the table', { hostVersion: HOST_VERSION, pluginVersion: '0.0.1' }],
  ])('is degraded/incompatible for %s', async (_name, versions) => {
    fake = await FakeSidecar.start();
    create(versions).configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    expect(connection.status().reason).toBe('incompatible');
  });

  it('is degraded/misconfigured for a bad URL and for an untrusted certificate', async () => {
    create().configure({ url: 'ftp://matter.example.com', token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    expect(connection.status().reason).toBe('misconfigured');
    fake = await FakeSidecar.start({ tls: await selfSignedCertificate() });
    connection.configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().reason === 'misconfigured' && connection.status().lastError?.code === 'tls');
    expect(connection.status().lastError?.message).toMatch(/certificate/);
  });

  it('connects over TLS with the administrator CA', async () => {
    const certificate = await selfSignedCertificate();
    fake = await FakeSidecar.start({ tls: certificate });
    create().configure({ url: fake.url, token: TOKEN, caCertificate: certificate.cert });
    await until(() => connection.status().state === 'connected');
  });

  it('reports a stored credential that cannot be used as misconfigured', () => {
    create().misconfigure('The stored credential cannot be decrypted. Enter it again.');
    expect(connection.status()).toMatchObject({ state: 'degraded', reason: 'misconfigured' });
  });

  it('restarts the backoff after a connection that stayed up', async () => {
    fake = await FakeSidecar.start();
    const { port } = fake;
    await fake.stop();
    create({ random: () => 0.9, stableAfterMs: 20 }).configure({ url: `http://127.0.0.1:${port}`, token: TOKEN });
    await until(() => logs.some((line) => line.includes('next attempt in 900 ms')));
    fake = await FakeSidecar.start({ port });
    await until(() => connection.status().state === 'connected', 6_000);
    await new Promise((resolve) => setTimeout(resolve, 60));
    logs.length = 0;
    await fake.stop();
    await until(() => logs.some((line) => line.includes('next attempt in')));
    expect(logs.join('\n')).toMatch(/next attempt in 900 ms/); // not 1800: the attempt counter was reset
  });

  it('closes the socket with 1000, aborts requests and starts nothing after stop', async () => {
    fake = await FakeSidecar.start();
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'connected');
    fake.restOverride = () => undefined; // never answers
    const inFlight = connection.request('fabric.get');
    await until(() => fake?.requests.at(-1)?.path === '/v1/fabric');
    connection.stop();
    await expect(inFlight).rejects.toBeInstanceOf(SidecarAbortedError);
    await until(() => fake?.sockets.size === 0);
    expect(fake.closeCodes).toEqual([CLOSE_CODES.normal]);
    const count = fake.requests.length;
    connection.configure({ url: fake.url, token: TOKEN }); // ignored once stopped
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(fake.requests.length).toBe(count);
  });

  it('logs an unexpected error at warn, scrubbed, as internal_error rather than a URL problem', async () => {
    fake = await FakeSidecar.start();
    const version = jest
      .spyOn(SidecarHttpClient.prototype, 'version')
      .mockRejectedValueOnce(new TypeError(`boom Bearer ${TOKEN}`));
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().state === 'degraded');
    version.mockRestore();
    expect(connection.status()).toMatchObject({ reason: 'misconfigured', lastError: { code: 'internal_error' } });
    expect(logs.find((line) => line.startsWith('warn:'))).toMatch(/TypeError: boom Bearer \[redacted\]/);
    expect(logs.join('\n')).not.toContain(TOKEN);
  });

  it('masks a token the sidecar echoes in a REST 401, a WebSocket-upgrade 401 or a stream error message', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    fake.unauthorizedMessage = `rejected ${TOKEN}, sent as Bearer ${TOKEN}`;
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().reason === 'unauthorized');
    const whileUnauthorized = JSON.stringify(connection.status());
    expect(connection.status().lastError?.message).toBe('rejected [redacted], sent as Bearer [redacted]');
    fake.tokens = [TOKEN];
    fake.rejectUpgrades = true;
    connection.configure({ url: fake.url, token: TOKEN });
    await until(() => fake?.upgrades.length === 1 && connection.status().reason === 'unauthorized');
    const afterUpgrade = JSON.stringify(connection.status());
    fake.rejectUpgrades = false;
    fake.onResume = (socket) => fake?.sendError(socket, 'unauthorized', `revoked Bearer ${TOKEN} and ${TOKEN}`);
    connection.configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().lastError?.message.startsWith('revoked') === true);
    expect(connection.status().lastError?.message).toBe('revoked Bearer [redacted] and [redacted]');
    const everything = JSON.stringify({ logs, states, whileUnauthorized, afterUpgrade, status: connection.status() });
    expect(everything).not.toContain(TOKEN);
    expect(everything).toContain('[redacted]');
  });

  it('never writes the token or an Authorization header into logs, errors or status', async () => {
    fake = await FakeSidecar.start({ tokens: ['another-token-0123456789abcdef0123456789'] });
    create().configure({ url: fake.url, token: TOKEN });
    await until(() => connection.status().reason === 'unauthorized');
    connection.configure({ url: 'http://127.0.0.1:1', token: TOKEN });
    await until(() => connection.status().reason === 'unavailable');
    connection.stop();
    const everything = JSON.stringify({ logs, states, status: connection.status() });
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain(`Bearer ${TOKEN}`);
  });
});
