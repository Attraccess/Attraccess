import { Server } from 'node:http';
import { connect, type AddressInfo } from 'node:net';

const originalListen = Server.prototype.listen;
import { createSidecar } from './sidecar';
import { configWith } from './config';
import { createLogger } from './logger';
import { WsClient, http, simulatedPlatform, startSidecar, validHeaders } from './testing/harness';

describe('lifecycle', () => {
  it('becomes ready only after the platform and transport started, and reports unready while draining', async () => {
    const sidecar = createSidecar({
      config: configWith(),
      logger: createLogger(() => undefined),
      loadPlatform: simulatedPlatform,
    });
    expect(sidecar.state.ready).toBe(false);
    const { port } = await sidecar.start();
    expect(sidecar.state.ready).toBe(true);
    // Keep one request in flight so the drain window is observable.
    const client = await WsClient.connect(port);
    const stopping = sidecar.stop();
    expect(sidecar.state.draining).toBe(true);
    expect(sidecar.state.ready).toBe(false);
    await client.until(() => client.closed !== null);
    expect(client.closed?.code).toBe(1001);
    await stopping;
    await expect(http(port, 'GET', '/health/live')).rejects.toThrow();
  });

  // The 503 refusal itself is covered by the versionedRefusal unit tests; a new connection cannot reach a draining
  // server because it stops accepting at once.
  it('lets an in-flight versioned request finish while refusing new connections', async () => {
    let release: () => void = () => undefined;
    const running = await startSidecar(
      {},
      {
        features: {
          'inventory.list': () =>
            new Promise((resolve) => (release = () => resolve({ authoritative: false, nodes: [] }))),
        },
      },
    );
    const inFlight = http(running.port, 'GET', '/v1/nodes', { headers: validHeaders() });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const stopping = running.stop();
    await expect(http(running.port, 'GET', '/health/ready')).rejects.toThrow();
    release();
    expect((await inFlight).status).toBe(200);
    await stopping;
  });

  it('is idempotent on repeated stop calls', async () => {
    const running = await startSidecar();
    await Promise.all([running.stop(), running.stop()]);
    await running.stop();
  });

  it('stopping a sidecar that never started is safe', async () => {
    const sidecar = createSidecar({
      config: configWith(),
      logger: createLogger(() => undefined),
      loadPlatform: simulatedPlatform,
    });
    await sidecar.stop();
  });

  it('closes the platform exactly once when startup fails and stop() follows', async () => {
    const occupied = await startSidecar();
    const close = jest.fn(async () => undefined);
    const sidecar = createSidecar({
      config: configWith({ port: occupied.port }),
      logger: createLogger(() => undefined),
      loadPlatform: async () => ({ ...(await simulatedPlatform()), close }),
    });
    await expect(sidecar.start()).rejects.toThrow();
    await sidecar.stop();
    await sidecar.stop();
    expect(close).toHaveBeenCalledTimes(1);
    await occupied.stop();
  });

  it('does not come up when stop() is called while the platform is still loading', async () => {
    let closed = false;
    // A close that takes a while, as a real platform's would.
    const close = jest.fn(() => new Promise<void>((resolve) => setTimeout(() => resolve(void (closed = true)), 50)));
    let finishLoading: () => void = () => undefined;
    const sidecar = createSidecar({
      config: configWith(),
      logger: createLogger(() => undefined),
      loadPlatform: () => new Promise((resolve) => (finishLoading = () => resolve({ version: '0.18.0', close }))),
    });
    const starting = sidecar.start();
    const rejected = expect(starting).rejects.toThrow('stopped while starting');
    const stopping = sidecar.stop();
    finishLoading();
    // stop() resolves only after the late platform is closed, so a process that exits on stop() does not leak it.
    await stopping;
    expect(closed).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    await rejected;
    expect(sidecar.state.ready).toBe(false);
  });

  it('does not stay bound when stop() is called while the server is starting to listen', async () => {
    const close = jest.fn(async () => undefined);
    const sidecar = createSidecar({
      config: configWith(),
      logger: createLogger(() => undefined),
      loadPlatform: async () => ({ version: '0.18.0', close }),
    });
    let port = 0;
    let stopping: Promise<void> = Promise.resolve();
    // Calls stop() at the exact moment the server starts listening, then lets the real listen() run.
    const listen = jest.spyOn(Server.prototype, 'listen').mockImplementationOnce(function (
      this: Server,
      ...args: unknown[]
    ) {
      stopping = sidecar.stop();
      this.once('listening', () => (port = (this.address() as AddressInfo).port));
      return originalListen.apply(this, args as Parameters<Server['listen']>);
    });
    await expect(sidecar.start()).rejects.toThrow('stopped while starting');
    await stopping;
    listen.mockRestore();
    expect(port).toBeGreaterThan(0);
    await expect(http(port, 'GET', '/health/live')).rejects.toThrow();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('does not let a refused upgrade socket that stays half open stall shutdown', async () => {
    const running = await startSidecar({ shutdownGraceMs: 60_000 });
    const socket = connect({ port: running.port, host: '127.0.0.1', allowHalfOpen: true });
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    const ended = new Promise<void>((resolve) => socket.once('end', () => resolve()));
    socket.write(
      'GET /v1/events HTTP/1.1\r\nhost: 127.0.0.1\r\nconnection: Upgrade\r\nupgrade: websocket\r\n' +
        'sec-websocket-version: 13\r\nsec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nx-matter-wire-version: 2\r\n\r\n',
    );
    socket.resume();
    await ended; // the 426 arrived; this client keeps its own half open on purpose
    const started = Date.now();
    await running.stop();
    expect(Date.now() - started).toBeLessThan(5_000);
    socket.destroy();
  });

  it('exits within the bounded grace period even when a connection refuses to close', async () => {
    const running = await startSidecar({ shutdownGraceMs: 150 });
    const socket = connect(running.port, '127.0.0.1');
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.write('GET /health/live HTTP/1.1\r\nhost: 127.0.0.1\r\n'); // incomplete request: never finishes
    const started = Date.now();
    await running.stop();
    expect(Date.now() - started).toBeLessThan(3_000);
    socket.destroy();
  });

  it('releases the platform handle when the transport fails to start', async () => {
    const first = await startSidecar();
    const close = jest.fn(async () => undefined);
    const clash = createSidecar({
      config: configWith({ port: first.port }),
      logger: createLogger(() => undefined),
      loadPlatform: async () => ({ version: '0.0.0', close }),
    });
    await expect(clash.start()).rejects.toThrow(/EADDRINUSE/);
    expect(close).toHaveBeenCalledTimes(1);
    await first.stop();
  });

  it('reports a start-up failure and keeps the process alive for the caller to decide', async () => {
    const first = await startSidecar();
    const clash = createSidecar({
      config: configWith({ port: first.port }),
      logger: createLogger(() => undefined),
      loadPlatform: simulatedPlatform,
    });
    await expect(clash.start()).rejects.toThrow(/EADDRINUSE/);
    await clash.stop();
    await first.stop();
    const failing = createSidecar({
      config: configWith(),
      logger: createLogger(() => undefined),
      loadPlatform: async () => {
        throw new Error('matter.js missing');
      },
    });
    await expect(failing.start()).rejects.toThrow('matter.js missing');
    expect(failing.state.ready).toBe(false);
  });

  it('survives repeated real TCP resets during rejected upgrades', async () => {
    const running = await startSidecar();
    for (let i = 0; i < 25; i += 1) {
      await new Promise<void>((resolve) => {
        const socket = connect(running.port, '127.0.0.1', () => {
          socket.write(
            `GET /v1/events HTTP/1.1\r\nhost: 127.0.0.1\r\nupgrade: websocket\r\nconnection: Upgrade\r\nsec-websocket-version: 13\r\nsec-websocket-key: dGhlIHNhbXBsZSBub25jZQ==\r\nx-matter-wire-version: 9\r\n\r\n`,
            () => socket.resetAndDestroy(),
          );
        });
        socket.on('error', () => undefined);
        socket.on('close', () => resolve());
      });
    }
    expect((await http(running.port, 'GET', '/health/live')).status).toBe(200);
    await running.stop();
  });

  it('logs no request secrets', async () => {
    const running = await startSidecar();
    await http(running.port, 'POST', '/v1/commissioning/sessions', {
      headers: { ...validHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ setupCode: '34970112332' }),
    });
    await running.stop();
    expect(running.logs.join('\n')).not.toContain('34970112332');
  });
});
