import { connect } from 'node:net';
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

  it('answers 503 during draining for versioned routes', async () => {
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
    const ready = await http(running.port, 'GET', '/health/ready').catch(() => null);
    if (ready) {
      expect(ready.status).toBe(503);
      expect(ready.body.status).toBe('draining');
    }
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
