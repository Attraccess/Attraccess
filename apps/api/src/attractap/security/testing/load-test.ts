/* eslint-disable no-console */
/**
 * Load test for the reader session layer: 1,000 emulated readers speaking the production
 * session protocol (TLS 1.3 inside binary WebSocket frames), 250 of them active with a
 * request/response every 5 s, 10 running OTA at the same time, then a server restart.
 *
 * The server side is the production SessionConnection + HandshakeLimiter (32 concurrent + 256
 * queued handshakes) with an echo application behind it, running in its own process so its
 * memory can be measured on its own. It does not include the database or the Nest handlers.
 *
 *   pnpm exec esbuild apps/api/src/attractap/security/testing/load-test.ts --bundle --platform=node \
 *     --outfile=/tmp/attractap-load/load-test.js && node /tmp/attractap-load/load-test.js
 *
 * Environment: READERS (1000), ACTIVE (250), OTA (10), ACTIVE_SECONDS (30).
 */
import { ChildProcess, fork } from 'child_process';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { HandshakeLimiter } from '../handshake-limiter';
import { SessionConnection, SessionDecision } from '../session-connection';
import { FrameType, SESSION_SUBPROTOCOL } from '../session-framing';
import { EmulatedReader, EmulatedReaderIdentity } from './emulated-reader';
import { createTestInstallation, createTestReader } from './test-pki';

const READERS = Number(process.env['READERS'] ?? 1000);
const ACTIVE = Number(process.env['ACTIVE'] ?? 250);
const OTA = Number(process.env['OTA'] ?? 10);
const ACTIVE_SECONDS = Number(process.env['ACTIVE_SECONDS'] ?? 30);
const PORT = 38000 + Math.floor(Math.random() * 1000);

interface ServerInit {
  type: 'init';
  port: number;
  server: { certificateChainPem: string; privateKeyPem: string; caCertificatePem: string };
  readers: Array<[string, number]>;
}

// ---------------------------------------------------------------------------------------- server
function runServer() {
  const limiter = new HandshakeLimiter(32, 256);
  const known = new Map<string, number>();
  let material: ServerInit['server'];
  let refused = 0;
  let maxQueue = 0;
  let sessions = 0;

  process.on('message', (message: ServerInit | { type: 'measure' }) => {
    if (message.type === 'measure') {
      // Collect first: RSS right after a reconnect burst is mostly garbage, not session state.
      const gc = (globalThis as { gc?: (options?: object) => void }).gc;
      // What V8 does on its own when idle; a plain gc() leaves the young generation committed.
      gc?.({ type: 'major', execution: 'sync', flavor: 'last-resort' });
      setTimeout(() => process.send?.({ type: 'measured', ...process.memoryUsage() }), 200);
      return;
    }
    if (message.type !== 'init') return;
    material = message.server;
    message.readers.forEach(([fingerprint, id]) => known.set(fingerprint, id));
    const http = createServer();
    const wss = new WebSocketServer({
      server: http,
      handleProtocols: (protocols) => (protocols.has(SESSION_SUBPROTOCOL) ? SESSION_SUBPROTOCOL : false),
    });
    wss.on('connection', (ws) => {
      const connection = new SessionConnection(ws, limiter);
      maxQueue = Math.max(maxQueue, limiter.queueDepth);
      connection
        .handshake(
          async () => material,
          async (peer): Promise<SessionDecision> =>
            peer.chainValid && peer.readerId !== null && known.get(peer.spkiFingerprint) === peer.readerId
              ? { kind: 'reader', readerId: peer.readerId, certificateNotAfter: peer.certificateNotAfter }
              : { kind: 'reject', reason: 'unknown' },
        )
        .then(() => {
          sessions++;
          connection.once('closed', () => sessions--);
          connection.on('message', (frame: { type: FrameType; payload: Buffer }) => {
            if (frame.payload.toString() === 'chunk') connection.sendFrame(FrameType.BINARY, Buffer.alloc(4096, 1));
            else connection.sendFrame(FrameType.JSON, Buffer.from('{"event":"RESPONSE"}'));
          });
        })
        .catch(() => {
          refused++;
        });
    });
    http.listen(message.port, '127.0.0.1', () => process.send?.({ type: 'ready' }));
    setInterval(
      () => process.send?.({ type: 'stats', rss: process.memoryUsage().rss, refused, maxQueue, sessions }),
      1000,
    ).unref();
  });
}

// ---------------------------------------------------------------------------------------- client
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class Fleet {
  public connected = 0;
  public refusals = 0;
  public readonly readers: EmulatedReader[] = [];
  private stopped = false;

  public constructor(private readonly identities: EmulatedReaderIdentity[]) {}

  public stop() {
    this.stopped = true;
    this.readers.forEach((reader) => reader.close());
  }

  /** One reader's lifetime: connect with jittered exponential backoff, reconnect when dropped. */
  public async run(index: number): Promise<void> {
    let attempt = 0;
    while (!this.stopped) {
      const reader = new EmulatedReader({ url: `ws://127.0.0.1:${PORT}/`, identity: this.identities[index] });
      try {
        await reader.connect();
        this.readers[index] = reader;
        this.connected++;
        attempt = 0;
        await reader.closed;
        this.connected--;
      } catch {
        this.refusals++;
        reader.close();
        attempt++;
        await sleep(Math.min(8000, 250 * 2 ** Math.min(attempt, 5)) * (0.5 + Math.random()));
      }
    }
  }
}

async function main() {
  const installation = await createTestInstallation('load-test');
  console.log(`generating ${READERS} reader identities ...`);
  const identities: Array<EmulatedReaderIdentity & { fingerprint: string }> = [];
  for (let i = 0; i < READERS; i++) identities.push(await createTestReader(installation, i + 1));

  let server: ChildProcess;
  let latest = { rss: 0, refused: 0, maxQueue: 0, sessions: 0 };
  const startServer = async () => {
    server = fork(__filename, ['server']);
    server.on('message', (m: { type: string } & typeof latest) => {
      if (m.type === 'stats') latest = m;
    });
    await new Promise<void>((resolve) =>
      server.once('message', (m: { type: string }) => m.type === 'ready' && resolve()),
    );
  };
  const init: ServerInit = {
    type: 'init',
    port: PORT,
    server: installation.server,
    readers: identities.map((identity, index) => [identity.fingerprint, index + 1]),
  };

  server = fork(__filename, ['server'], { execArgv: ['--expose-gc'] });
  server.on('message', (m: { type: string } & typeof latest) => {
    if (m.type === 'stats') latest = m;
  });
  const measure = () =>
    new Promise<number>((resolve) => {
      const onMessage = (m: { type: string } & NodeJS.MemoryUsage) => {
        if (m.type !== 'measured') return;
        server.off('message', onMessage);
        const mib = (n: number) => (n / 1024 / 1024).toFixed(1);
        console.log(`server memory: rss ${mib(m.rss)} heap ${mib(m.heapUsed)} external ${mib(m.external)} MiB`);
        resolve(m.rss);
      };
      server.on('message', onMessage);
      server.send({ type: 'measure' });
    });
  const ready = new Promise<void>((resolve) =>
    server.on('message', (m: { type: string }) => m.type === 'ready' && resolve()),
  );
  server.send(init);
  await ready;
  await sleep(1500);
  const baselineRss = await measure();

  const fleet = new Fleet(identities);
  const started = Date.now();
  identities.forEach((_, i) => void fleet.run(i));
  while (fleet.connected < READERS) await sleep(250);
  const connectSeconds = (Date.now() - started) / 1000;
  console.log(
    `all ${READERS} connected after ${connectSeconds.toFixed(1)}s (client-side refusals/retries: ${fleet.refusals})`,
  );

  // Steady state: ACTIVE readers do a request/response every 5 s, OTA readers pull 4 KiB chunks.
  const responses = { count: 0 };
  const timers: NodeJS.Timeout[] = [];
  for (let i = 0; i < ACTIVE; i++) {
    const reader = fleet.readers[i];
    reader.tls?.on('data', () => responses.count++);
    timers.push(setInterval(() => reader.send(FrameType.JSON, '{"event":"EVENT"}'), 5000 + Math.random() * 100));
  }
  for (let i = ACTIVE; i < ACTIVE + OTA; i++) {
    const reader = fleet.readers[i];
    timers.push(setInterval(() => reader.send(FrameType.JSON, 'chunk'), 20));
  }
  await sleep(ACTIVE_SECONDS * 1000);
  timers.forEach(clearInterval);
  const peakRss = latest.rss;
  const steadyRss = await measure();
  const memoryMiB = (steadyRss - baselineRss) / 1024 / 1024;

  // Server restart: every reader must come back.
  console.log('restarting the server ...');
  server.kill('SIGKILL');
  await sleep(500);
  const restartAt = Date.now();
  server = fork(__filename, ['server']);
  server.on('message', (m: { type: string } & typeof latest) => {
    if (m.type === 'stats') latest = m;
  });
  const ready2 = new Promise<void>((resolve) =>
    server.on('message', (m: { type: string }) => m.type === 'ready' && resolve()),
  );
  server.send(init);
  await ready2;
  while (fleet.connected < READERS && Date.now() - restartAt < 600_000) await sleep(500);
  const recoverySeconds = (Date.now() - restartAt) / 1000;

  fleet.stop();
  server.kill();
  void startServer;
  const result = {
    readers: READERS,
    active: ACTIVE,
    ota: OTA,
    connectSeconds,
    extraServerMemoryMiB: Number(memoryMiB.toFixed(1)),
    uncollectedPeakMiB: Number(((peakRss - baselineRss) / 1024 / 1024).toFixed(1)),
    memoryLimitMiB: Math.round((64 * READERS) / 1000),
    handshakeLimit: '32 active + 256 queued',
    maxHandshakeQueueObserved: latest.maxQueue,
    clientRefusalsAndRetries: fleet.refusals,
    responsesReceived: responses.count,
    recoveryAfterRestartSeconds: recoverySeconds,
    allBackWithin180s: fleet.connected >= READERS && recoverySeconds <= 180,
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.allBackWithin180s && memoryMiB <= 64 ? 0 : 1);
}

if (process.argv[2] === 'server') runServer();
else void main();
