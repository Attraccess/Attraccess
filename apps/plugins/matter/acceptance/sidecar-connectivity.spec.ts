// The Matter plugin against the real Matter sidecar (in process, with the Matter platform simulated, and as the built
// process for the kill tests). Acceptance composes plugin and sidecar; shipped code never imports across them.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import { runInThisContext } from 'node:vm';
import request from 'supertest';
import { COMPATIBILITY_TABLE, HEADER_AUTHORIZATION } from '@attraccess/matter-contract';
import { configWith } from '../../../matter-sidecar/src/testing/config';
import { createSidecar, type Sidecar, type SidecarOptions } from '../../../matter-sidecar/src/sidecar';
import { http as sidecarHttp, simulatedPlatform } from '../../../matter-sidecar/src/testing/harness';
import type { ConnectionStatus, SidecarConnection } from '../backend/client/connection';
import { SidecarClientError } from '../backend/client/errors';
import { selfSignedCertificate } from '../backend/testing/certs';
import { ADMIN, bootHost, type Host } from './host.test-utils';
import { Signal } from './signal.test-utils';

const NEW_TOKEN = 'new-rotation-token-0123456789abcdef0123456789';
const OLD_TOKEN = 'old-rotation-token-0123456789abcdef0123456789';

/** Resolves once the connection's status matches, checked now and on every change of state or reason. */
function connectionStatus(
  connection: SidecarConnection,
  waitingFor: string,
  matches: (status: ConnectionStatus) => boolean,
  timeoutMs?: number,
) {
  const changed = new Signal();
  const unsubscribe = connection.onStateChange(() => changed.notify());
  return changed
    .until(
      waitingFor,
      () => matches(connection.status()),
      () => connection.status(),
      timeoutMs,
    )
    .finally(unsubscribe);
}

/** The events the plugin delivers to its features from now on. */
function deliveries(connection: SidecarConnection) {
  const events: { eventId: string; sequence: number }[] = [];
  const delivered = new Signal();
  connection.onEvent(({ event }) => {
    events.push(event);
    delivered.notify();
  });
  const sequences = () => events.map((event) => event.sequence);
  const wait = (waitingFor: string, done: () => boolean) =>
    delivered.until(waitingFor, done, () => ({ delivered: sequences(), connection: connection.status() }));
  return {
    sequences,
    count: (count: number) => wait(`${count} delivered events`, () => events.length >= count),
    event: (eventId: string) => wait(`event ${eventId}`, () => events.some((event) => event.eventId === eventId)),
  };
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolvePort(port));
    });
  });
}

/** The typed error a promise rejects with, so a test can assert on its kind, code and outcome. */
async function rejection(promise: Promise<unknown>): Promise<SidecarClientError> {
  const error = await promise.then(
    () => new Error('expected the request to fail'),
    (reason: unknown) => reason,
  );
  if (!(error instanceof SidecarClientError)) throw error;
  return error;
}

/**
 * Counts as the sidecar from the plugin's point of view. It can be severed to simulate a dropped network link, or
 * stalled: the TCP connections stay open but nothing the plugin sends reaches the sidecar any more.
 */
class TcpProxy {
  private readonly sockets = new Set<Socket>();
  private readonly server: Server;
  private stalled = false;
  /** Set while the event stream's client messages are held back: what has been held, per upstream connection. */
  private held: (() => void)[] | null = null;
  port = 0;
  constructor(private readonly targetPort: number) {
    this.server = createServer((client) => {
      const upstream = connect(this.targetPort, '127.0.0.1');
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => this.sockets.delete(socket));
      }
      let eventStream = false;
      client.on('data', (chunk) => {
        if (this.stalled) return;
        if (eventStream && this.held) return void this.held.push(() => upstream.write(chunk));
        eventStream ||= chunk.toString('latin1').startsWith('GET /v1/events ');
        upstream.write(chunk);
      });
      client.on('end', () => upstream.end());
      upstream.pipe(client);
    });
  }
  /** Delays everything the plugin sends on the event stream after the upgrade request, `resume` first of all. */
  holdEventStream() {
    this.held = [];
  }
  releaseEventStream() {
    const held = this.held ?? [];
    this.held = null;
    for (const forward of held) forward();
  }
  stall() {
    this.stalled = true;
  }
  async start() {
    await new Promise<void>((resolveStart) => this.server.listen(0, '127.0.0.1', () => resolveStart()));
    this.port = (this.server.address() as { port: number }).port;
  }
  sever() {
    for (const socket of this.sockets) socket.destroy();
  }
  async stop() {
    this.sever();
    await new Promise<void>((resolveStop) => this.server.close(() => resolveStop()));
  }
}

describe('Matter plugin against the real sidecar', () => {
  let host: Host;
  let sidecar: Sidecar | undefined;
  let proxy: TcpProxy | undefined;
  const http = () => request(host.app.getHttpServer());
  const status = async () => (await http().get('/api/matter/connection/status').set(ADMIN)).body;
  const put = (body: Record<string, unknown>) => http().put('/api/matter/connection').set(ADMIN).send(body);

  async function startSidecar(overrides: Parameters<typeof configWith>[0], options: Partial<SidecarOptions> = {}) {
    sidecar = createSidecar({
      config: configWith(overrides),
      loadPlatform: simulatedPlatform,
      logger: () => undefined,
      ...options,
    });
    return (await sidecar.start()).port;
  }
  const reaches = (waitingFor: string, matches: (status: ConnectionStatus) => boolean, timeoutMs?: number) =>
    connectionStatus(host.service.connection, waitingFor, matches, timeoutMs);
  const connected = () => reaches('the connection to be connected', (current) => current.state === 'connected');
  const degraded = (reason: string) =>
    reaches(`the connection to be degraded as ${reason}`, (current) => current.reason === reason);
  /** Resolves once the plugin itself has seen the link go down, so a later `connected` is a new connection. */
  const disconnected = () => reaches('the plugin to see the link go down', (current) => current.state !== 'connected');
  /** `/version` straight against the sidecar with one token: proves which tokens a (re)started sidecar accepts. */
  const versionStatusWith = async (port: number, token: string) =>
    (await sidecarHttp(port, 'GET', '/version', { headers: { [HEADER_AUTHORIZATION]: `Bearer ${token}` } })).status;

  beforeEach(async () => {
    host = await bootHost();
  }, 60_000);
  afterEach(async () => {
    await host.close();
    await proxy?.stop();
    await sidecar?.stop();
    proxy = sidecar = undefined;
  });

  it('connects to a sidecar that is released together with the plugin', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    expect(await status()).toMatchObject({
      reason: null,
      sidecar: { sidecar: COMPATIBILITY_TABLE[0].sidecar, matterJs: COMPATIBILITY_TABLE[0].matterJs },
      capabilities: { capabilities: expect.any(Array) },
    });
  });

  it('shows unauthorized for a wrong token and recovers as soon as the settings change', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await degraded('unauthorized');
    expect((await status()).lastError).toMatchObject({ code: 'unauthorized' });
    const changedAt = Date.now();
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    expect(Date.now() - changedAt).toBeLessThan(5_000);
  });

  it('rotates the credential without losing the connection and without rebuilding anything', async () => {
    const port = await freePort();
    await startSidecar({ authTokens: [OLD_TOKEN], port });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await connected();
    // 1. New token as current, old one as previous, restart the sidecar: the plugin keeps working with the old token.
    await sidecar?.stop();
    await disconnected();
    await startSidecar({ authTokens: [NEW_TOKEN, OLD_TOKEN], port });
    await connected();
    // 2. Enter the new token in the Matter page.
    const beforeChange = (await status()).since;
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await reaches(
      'a new connection with the new token',
      (current) => current.state === 'connected' && current.since !== beforeChange,
    );
    // 3. Drop the previous token and restart: the old token is refused now, and the plugin reconnects with the new one.
    await sidecar?.stop();
    await disconnected();
    const beforeRestart = (await status()).since;
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    expect(await versionStatusWith(port, OLD_TOKEN)).toBe(401);
    expect(await versionStatusWith(port, NEW_TOKEN)).toBe(200);
    await connected();
    const after = await status();
    expect(after.since).not.toBe(beforeRestart);
    expect(after.lastError).toBeNull();
  }, 30_000);

  it('connects over https/wss with an administrator-supplied CA and calls an untrusted certificate misconfigured', async () => {
    const certificate = await selfSignedCertificate();
    const port = await startSidecar({
      authTokens: [NEW_TOKEN],
      tls: { cert: Buffer.from(certificate.cert), key: Buffer.from(certificate.key) },
    });
    const url = `https://127.0.0.1:${port}`;
    await put({ url, credential: NEW_TOKEN }).expect(200);
    await degraded('misconfigured');
    expect((await status()).lastError).toMatchObject({ code: 'tls' });
    // A changed CA needs the credential again, so a stored token never goes to a newly trusted endpoint.
    await put({ url, caCertificate: certificate.cert }).expect(400);
    await put({ url, credential: NEW_TOKEN, caCertificate: certificate.cert }).expect(200);
    await connected();
    expect((await status()).insecureTransport).toBe(false);
    // Clearing the CA must drop it from the client too: the same certificate is untrusted again.
    await put({ url, credential: NEW_TOKEN, caCertificate: null }).expect(200);
    await degraded('misconfigured');
    expect(await status()).toMatchObject({ state: 'degraded', lastError: { code: 'tls' } });
  });

  it('resumes after a dropped link with no lost and no duplicate event', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    proxy = new TcpProxy(port);
    await proxy.start();
    await put({ url: `http://127.0.0.1:${proxy.port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    const received = deliveries(host.service.connection);
    const publish = (count: number) => {
      for (let i = 0; i < count; i += 1) sidecar?.stream.publish('fabric.changed', { n: i });
    };
    publish(3);
    await received.count(3);
    proxy.sever();
    publish(4); // published while the plugin is disconnected
    await received.count(7);
    publish(2);
    await received.count(9);
    const sequences = received.sequences();
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(sequences.slice(-9)).toEqual(Array.from({ length: 9 }, (_, i) => sequences.slice(-9)[0] + i));
  }, 30_000);

  it('loses no event published after it reports connected, even while its resume is still on the way', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    proxy = new TcpProxy(port);
    await proxy.start();
    proxy.holdEventStream();
    const received = deliveries(host.service.connection);
    await put({ url: `http://127.0.0.1:${proxy.port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    const published = [1, 2, 3].map((n) => sidecar?.stream.publish('fabric.changed', { n })?.sequence);
    proxy.releaseEventStream();
    await received.count(3);
    expect(received.sequences()).toEqual(published);
  }, 30_000);

  it('raises a reconciliation signal when the cursor belongs to an earlier run of the sidecar', async () => {
    const port = await freePort();
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    const signals: string[] = [];
    const signalled = new Signal();
    host.service.connection.onReconciliationRequired((reason) => {
      signals.push(reason);
      signalled.notify();
    });
    const delivered = deliveries(host.service.connection);
    const published = sidecar?.stream.publish('fabric.changed', {});
    await delivered.event(published?.eventId ?? '');
    await sidecar?.stop();
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    await signalled.until(
      'a reconciliation signal after the sidecar restart',
      () => signals.length > 0,
      () => host.service.connection.status(),
    );
    expect(signals[0]).toBe('foreign-stream');
    await connected();
  }, 30_000);

  it('never writes the token into a log line or a status response', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await degraded('unauthorized');
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    await sidecar?.stop();
    await degraded('unavailable');
    const everything = JSON.stringify({ logs: host.logs, status: await status() });
    for (const secret of [OLD_TOKEN, NEW_TOKEN]) expect(everything).not.toContain(secret);
    expect(everything.toLowerCase()).not.toContain('bearer ');
  }, 30_000);

  it('calls a sidecar running another matter.js release incompatible and names both sides', async () => {
    const skewed = '0.17.99';
    const port = await startSidecar(
      { authTokens: [NEW_TOKEN] },
      { loadPlatform: async () => ({ version: skewed, close: async () => undefined }) },
    );
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await degraded('incompatible');
    const current = await status();
    expect(current).toMatchObject({
      state: 'degraded',
      sidecar: { matterJs: skewed },
      capabilities: null,
      lastError: {
        code: 'incompatible_release',
        details: {
          received: { matterJs: skewed, sidecar: COMPATIBILITY_TABLE[0].sidecar },
          supported: COMPATIBILITY_TABLE,
        },
      },
    });
    // No fallback: the plugin does not open the event stream or offer operations against it.
    await expect(host.service.connection.request('fabric.get')).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('calls a real sidecar incompatible when the host release is outside the table', async () => {
    await host.close();
    host = await bootHost({ hostVersion: '1.10.0' });
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await degraded('incompatible');
    expect((await status()).lastError).toMatchObject({
      code: 'incompatible_release',
      details: { received: { attraccess: '1.10.0' }, supported: COMPATIBILITY_TABLE },
    });
  });

  it('turns a stalled request into a typed timeout and never repeats a physical operation', async () => {
    const received: { id: string; correlationId: string }[] = [];
    const reached = new Signal();
    // A handler that never answers; the sidecar gives up at the request deadline the plugin sent.
    const stall =
      (id: string) =>
      ({ correlationId }: { correlationId: string }) => {
        received.push({ id, correlationId });
        reached.notify();
        return new Promise<never>(() => undefined);
      };
    // The plugin reads the fabric on its own too (on connect, and its backup schedule): those reads carry their own
    // correlation IDs, so the requests this test sends are told apart by theirs, without switching anything off.
    const ours = new Set<string>();
    const tagged = () => {
      const correlationId = randomUUID();
      ours.add(correlationId);
      return correlationId;
    };
    const calls = () => received.filter((call) => ours.has(call.correlationId)).map((call) => call.id);
    const others = () => received.filter((call) => !ours.has(call.correlationId)).map((call) => call.id);
    const port = await startSidecar(
      { authTokens: [NEW_TOKEN] },
      { features: { 'fabric.get': stall('fabric.get'), 'fabric.create': stall('fabric.create') } },
    );
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    const connection = host.service.connection;

    const read = await rejection(connection.request('fabric.get', { timeoutMs: 200, correlationId: tagged() }));
    expect(read).toMatchObject({ kind: 'timeout', code: 'timeout' });
    expect(read.outcome).toBeUndefined();

    const physical = await rejection(
      connection.request('fabric.create', { body: { label: 'Workshop' }, timeoutMs: 200, correlationId: tagged() }),
    );
    expect(physical).toMatchObject({ kind: 'timeout', code: 'timeout', outcome: 'uncertain' });

    const controller = new AbortController();
    const cancelled = rejection(
      connection.request('fabric.get', { signal: controller.signal, timeoutMs: 10_000, correlationId: tagged() }),
    );
    await reached.until('the third request to reach the sidecar', () => calls().length === 3, calls);
    controller.abort();
    expect(await cancelled).toMatchObject({ kind: 'aborted' });

    // Give a retry every chance to happen: none does, and the failed requests do not degrade the connection.
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    expect(calls()).toEqual(['fabric.get', 'fabric.create', 'fabric.get']);
    // A repeat under a new correlation ID would show up here: the plugin's own requests are fabric reads only.
    expect(others().filter((id) => id !== 'fabric.get')).toEqual([]);
    expect((await status()).state).toBe('connected');
  }, 30_000);

  it('gives up on its own when the link stalls and the sidecar cannot answer at all', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    proxy = new TcpProxy(port);
    await proxy.start();
    await put({ url: `http://127.0.0.1:${proxy.port}`, credential: NEW_TOKEN }).expect(200);
    await connected();
    proxy.stall();
    const startedAt = Date.now();
    const error = await rejection(host.service.connection.request('fabric.get', { timeoutMs: 200 }));
    expect(error).toMatchObject({ kind: 'timeout', code: 'timeout', correlationId: expect.any(String) });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  }, 30_000);
});

const builtSidecar = join(resolve(__dirname, '../../../..'), 'dist/apps/matter-sidecar/main.js');

describe('killing the sidecar process', () => {
  let host: Host;
  let child: ChildProcess | undefined;
  const http = () => request(host.app.getHttpServer());
  const status = async () => (await http().get('/api/matter/connection/status').set(ADMIN)).body;

  function launch(port: number): ChildProcess {
    const started = spawn(process.execPath, [builtSidecar], {
      env: { PATH: process.env.PATH ?? '', MATTER_SIDECAR_PORT: String(port), MATTER_SIDECAR_AUTH_TOKEN: NEW_TOKEN },
    });
    child = started;
    return started;
  }
  const listening = (started: ChildProcess) =>
    new Promise<void>((resolveListening, reject) => {
      started.stdout?.on('data', (chunk) => String(chunk).includes('listening') && resolveListening());
      started.once('exit', () => reject(new Error('sidecar exited before listening')));
    });
  const reaches = (waitingFor: string, matches: (status: ConnectionStatus) => boolean) =>
    connectionStatus(host.service.connection, waitingFor, matches, 20_000);
  const exited = (started: ChildProcess) =>
    new Promise<void>((resolveExit) => started.once('exit', () => resolveExit()));

  beforeEach(async () => {
    // The retry delay is `random() * ceiling`, and the ceiling doubles with every attempt up to 60 s. A sidecar that
    // is slow to boot lets the attempts pile up, so a real jitter could schedule the retry that finds it later than
    // any wait here. The connection takes `Math.random` when it is built; pinned, a retry is at most 3 s away.
    jest.spyOn(Math, 'random').mockReturnValue(0.05);
    host = await bootHost();
  }, 60_000);
  afterEach(async () => {
    child?.kill('SIGKILL');
    await host.close();
    jest.restoreAllMocks();
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'keeps core running (no crash, no exit) after %s, reports unavailable and recovers on restart',
    async (signal) => {
      const port = await freePort();
      const first = launch(port);
      await listening(first);
      const url = `http://127.0.0.1:${port}`;
      await http().put('/api/matter/connection').set(ADMIN).send({ url, credential: NEW_TOKEN }).expect(200);
      await reaches('the first sidecar process to be connected', (current) => current.state === 'connected');
      // Core runs in this process, so a crash would not change the PID; it shows up on these events instead. Jest's
      // `process` is a sandboxed copy that never emits them, so the listeners go on the real process object.
      const realProcess = runInThisContext('process') as NodeJS.Process;
      const crashes: unknown[] = [];
      const onCrash = (error: unknown) => crashes.push(error);
      realProcess.on('unhandledRejection', onCrash);
      realProcess.on('uncaughtException', onCrash);
      const exit = jest.spyOn(process, 'exit').mockImplementation(((code?: number) => {
        crashes.push(new Error(`process.exit(${code})`));
      }) as never);

      try {
        first.kill(signal);
        await exited(first);
        await reaches('the killed sidecar to show as unavailable', (current) => current.reason === 'unavailable');

        expect((await http().get('/api/unrelated').expect(200)).body).toEqual({ pid: process.pid, ok: true });
        await http().get('/api/other-plugin').expect(200);
        expect(await status()).toMatchObject({ state: 'degraded', reason: 'unavailable' });
        expect((await status()).nextRetryAt).not.toBeNull();

        const second = launch(port);
        await listening(second);
        await reaches('the restarted sidecar to be connected', (current) => current.state === 'connected');
        second.kill('SIGTERM');
        await exited(second);
        expect(crashes).toEqual([]);
        expect(exit).not.toHaveBeenCalled();
      } finally {
        realProcess.off('unhandledRejection', onCrash);
        realProcess.off('uncaughtException', onCrash);
        exit.mockRestore();
      }
    },
    60_000,
  );
});
