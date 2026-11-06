// The Matter plugin against the real Matter sidecar (in process, with the Matter platform simulated, and as the built
// process for the kill tests). Acceptance composes plugin and sidecar; shipped code never imports across them.
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, connect, type Server, type Socket } from 'node:net';
import { join, resolve } from 'node:path';
import request from 'supertest';
import { COMPATIBILITY_TABLE } from '@attraccess/matter-contract';
import { configWith } from '../../../matter-sidecar/src/config';
import { createSidecar, type Sidecar } from '../../../matter-sidecar/src/sidecar';
import { simulatedPlatform } from '../../../matter-sidecar/src/testing/harness';
import { selfSignedCertificate } from '../backend/testing/certs';
import { ADMIN, bootHost, type Host } from './host';

const NEW_TOKEN = 'new-rotation-token-0123456789abcdef0123456789';
const OLD_TOKEN = 'old-rotation-token-0123456789abcdef0123456789';

async function until(predicate: () => boolean | Promise<boolean>, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
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

/** Counts as the sidecar from the plugin's point of view; can be severed to simulate a dropped network link. */
class TcpProxy {
  private readonly sockets = new Set<Socket>();
  private readonly server: Server;
  port = 0;
  constructor(private readonly targetPort: number) {
    this.server = createServer((client) => {
      const upstream = connect(this.targetPort, '127.0.0.1');
      for (const socket of [client, upstream]) {
        this.sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => this.sockets.delete(socket));
      }
      client.pipe(upstream);
      upstream.pipe(client);
    });
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

  async function startSidecar(overrides: Parameters<typeof configWith>[0]) {
    sidecar = createSidecar({
      config: configWith(overrides),
      loadPlatform: simulatedPlatform,
      logger: () => undefined,
    });
    return (await sidecar.start()).port;
  }

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
    await until(async () => (await status()).state === 'connected');
    expect(await status()).toMatchObject({
      reason: null,
      sidecar: { sidecar: COMPATIBILITY_TABLE[0].sidecar, matterJs: COMPATIBILITY_TABLE[0].matterJs },
      capabilities: { capabilities: expect.any(Array) },
    });
  });

  it('shows unauthorized for a wrong token and recovers as soon as the settings change', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await until(async () => (await status()).reason === 'unauthorized');
    expect((await status()).lastError).toMatchObject({ code: 'unauthorized' });
    const changedAt = Date.now();
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    expect(Date.now() - changedAt).toBeLessThan(5_000);
  });

  it('rotates the credential without losing the connection and without rebuilding anything', async () => {
    const port = await freePort();
    await startSidecar({ authTokens: [OLD_TOKEN], port });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    // 1. New token as current, old one as previous, restart the sidecar: the plugin keeps working with the old token.
    await sidecar?.stop();
    await startSidecar({ authTokens: [NEW_TOKEN, OLD_TOKEN], port });
    await until(async () => (await status()).state === 'connected');
    // 2. Enter the new token in the Matter page.
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    // 3. Drop the previous token and restart: still connected with the new one.
    await sidecar?.stop();
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    await until(async () => (await status()).state === 'connected');
    expect((await status()).lastError).toBeNull();
  }, 30_000);

  it('connects over https/wss with an administrator-supplied CA and calls an untrusted certificate misconfigured', async () => {
    const certificate = await selfSignedCertificate();
    const port = await startSidecar({
      authTokens: [NEW_TOKEN],
      tls: { cert: Buffer.from(certificate.cert), key: Buffer.from(certificate.key) },
    });
    const url = `https://127.0.0.1:${port}`;
    await put({ url, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).reason === 'misconfigured');
    expect((await status()).lastError).toMatchObject({ code: 'tls' });
    await put({ url, caCertificate: certificate.cert }).expect(200);
    await until(async () => (await status()).state === 'connected');
    expect((await status()).insecureTransport).toBe(false);
  });

  it('resumes after a dropped link with no lost and no duplicate event', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    proxy = new TcpProxy(port);
    await proxy.start();
    await put({ url: `http://127.0.0.1:${proxy.port}`, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    const received: number[] = [];
    host.service.connection.onEvent(({ event }) => received.push(event.sequence));
    const publish = (count: number) => {
      for (let i = 0; i < count; i += 1) sidecar?.stream.publish('device.state', { n: i });
    };
    publish(3);
    await until(() => received.length >= 3);
    proxy.sever();
    publish(4); // published while the plugin is disconnected
    await until(() => received.length >= 7, 15_000);
    publish(2);
    await until(() => received.length >= 9);
    const sequences = [...received];
    expect(new Set(sequences).size).toBe(sequences.length);
    expect(sequences.slice(-9)).toEqual(Array.from({ length: 9 }, (_, i) => sequences.slice(-9)[0] + i));
  }, 30_000);

  it('raises a reconciliation signal when the cursor belongs to an earlier run of the sidecar', async () => {
    const port = await freePort();
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    const signals: string[] = [];
    host.service.connection.onReconciliationRequired((reason) => signals.push(reason));
    sidecar?.stream.publish('device.state', {});
    await until(() => host.service.connection.status().state === 'connected');
    await sidecar?.stop();
    await startSidecar({ authTokens: [NEW_TOKEN], port });
    await until(() => signals.length > 0, 15_000);
    expect(signals[0]).toBe('foreign-stream');
    await until(async () => (await status()).state === 'connected');
  }, 30_000);

  it('never writes the token into a log line or a status response', async () => {
    const port = await startSidecar({ authTokens: [NEW_TOKEN] });
    await put({ url: `http://127.0.0.1:${port}`, credential: OLD_TOKEN }).expect(200);
    await until(async () => (await status()).reason === 'unauthorized');
    await put({ url: `http://127.0.0.1:${port}`, credential: NEW_TOKEN }).expect(200);
    await until(async () => (await status()).state === 'connected');
    await sidecar?.stop();
    await until(async () => (await status()).reason === 'unavailable');
    const everything = JSON.stringify({ logs: host.logs, status: await status() });
    for (const secret of [OLD_TOKEN, NEW_TOKEN]) expect(everything).not.toContain(secret);
    expect(everything.toLowerCase()).not.toContain('bearer ');
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
  const exited = (started: ChildProcess) =>
    new Promise<void>((resolveExit) => started.once('exit', () => resolveExit()));

  beforeEach(async () => {
    host = await bootHost();
  }, 60_000);
  afterEach(async () => {
    child?.kill('SIGKILL');
    await host.close();
  });

  it.each(['SIGTERM', 'SIGKILL'] as const)(
    'keeps core running with the same PID after %s, reports unavailable and recovers on restart',
    async (signal) => {
      const port = await freePort();
      const first = launch(port);
      await listening(first);
      const url = `http://127.0.0.1:${port}`;
      await http().put('/api/matter/connection').set(ADMIN).send({ url, credential: NEW_TOKEN }).expect(200);
      await until(async () => (await status()).state === 'connected');
      const pid = process.pid;

      first.kill(signal);
      await exited(first);
      await until(async () => (await status()).reason === 'unavailable', 15_000);

      expect(process.pid).toBe(pid);
      expect((await http().get('/api/unrelated').expect(200)).body).toEqual({ pid, ok: true });
      await http().get('/api/other-plugin').expect(200);
      expect(await status()).toMatchObject({ state: 'degraded', reason: 'unavailable' });
      expect((await status()).nextRetryAt).not.toBeNull();

      const second = launch(port);
      await listening(second);
      await until(async () => (await status()).state === 'connected', 20_000);
      second.kill('SIGTERM');
      await exited(second);
    },
    60_000,
  );
});
