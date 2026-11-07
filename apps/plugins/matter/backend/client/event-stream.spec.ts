import { CLOSE_CODES, DEFAULT_REPLAY_MAX_EVENTS, parseCursor } from '@attraccess/matter-contract';
import type { WebSocket } from 'ws';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar';
import {
  PING_INTERVAL_MS,
  SEEN_EVENT_IDS,
  SeenEventIds,
  SidecarEventStream,
  type StreamClose,
  type StreamEvent,
} from './event-stream';
import { SidecarHttpClient } from './rest-client';
import { SidecarUnauthorizedError, SidecarUnavailableError } from './errors';

const identity = { attraccessVersion: HOST_VERSION, pluginVersion: entry.plugin, sidecarVersion: entry.sidecar };

async function until(predicate: () => boolean, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('event-stream limits', () => {
  it('remembers at least the 1000 event IDs a replay can repeat, and pings every 30 s', () => {
    expect(SEEN_EVENT_IDS).toBeGreaterThanOrEqual(1000);
    expect(SEEN_EVENT_IDS).toBeGreaterThanOrEqual(DEFAULT_REPLAY_MAX_EVENTS);
    expect(PING_INTERVAL_MS).toBe(30_000);
  });
});

describe('SeenEventIds', () => {
  it('is bounded and forgets the oldest ID first', () => {
    const seen = new SeenEventIds(3);
    expect(['a', 'b', 'c', 'a'].map((id) => seen.add(id))).toEqual([true, true, true, false]);
    seen.add('d');
    expect(seen.size).toBe(3);
    expect(seen.add('a')).toBe(true); // 'a' was evicted
    seen.clear();
    expect(seen.size).toBe(0);
  });
});

describe('SidecarEventStream', () => {
  let fake: FakeSidecar;
  let stream: SidecarEventStream;
  const events: StreamEvent[] = [];
  const reconciliations: string[] = [];
  const closes: StreamClose[] = [];
  let hellos = 0;

  const open = (pingMs?: number) => {
    const client = new SidecarHttpClient({ url: fake.url, token: TOKEN }, identity);
    stream = new SidecarEventStream(
      () => client,
      {
        onHello: () => (hellos += 1),
        onEvent: (event) => events.push(event),
        onReconciliationRequired: (reason) => reconciliations.push(reason),
        onClose: (close) => closes.push(close),
      },
      pingMs,
    );
    stream.connect(fake.url);
  };

  beforeEach(async () => {
    events.length = 0;
    reconciliations.length = 0;
    closes.length = 0;
    hellos = 0;
    fake = await FakeSidecar.start();
  });
  afterEach(async () => {
    stream?.disconnect();
    await fake.stop();
  });

  it('starts fresh without a cursor, then resumes with the last cursor after a disconnect', async () => {
    open();
    await until(() => hellos === 1);
    await until(() => fake.resumes.length === 1);
    expect(fake.resumes[0].cursor).toBeUndefined();
    fake.broadcast(fake.nextEvent());
    fake.broadcast(fake.nextEvent());
    await until(() => events.length === 2);
    fake.killSockets();
    await until(() => closes.length === 1);
    expect(closes[0].error).not.toBeNull();
    const cursor = stream.cursor as string;
    expect(parseCursor(cursor)?.sequence).toBe(2);
    stream.connect(fake.url);
    await until(() => fake.resumes.length === 2);
    expect(fake.resumes[1].cursor).toBe(cursor);
  });

  it('delivers neither a lost nor a duplicate event across a resume', async () => {
    open();
    await until(() => hellos === 1);
    fake.broadcast(fake.nextEvent()); // 1
    await until(() => events.length === 1);
    fake.killSockets();
    await until(() => closes.length === 1);
    // The sidecar replays 2 and 3 after the cursor; 2 is also repeated as a duplicate of the same event ID.
    const second = fake.nextEvent();
    const third = fake.nextEvent();
    fake.onResume = (socket) => {
      fake.send(socket, second);
      fake.send(socket, second);
      fake.send(socket, third);
    };
    stream.connect(fake.url);
    await until(() => events.length === 3);
    expect(events.map((e) => e.event.sequence)).toEqual([1, 2, 3]);
  });

  it('drops an event whose ID was already delivered', async () => {
    open();
    await until(() => hellos === 1);
    const event = fake.nextEvent();
    fake.broadcast(event);
    fake.broadcast(event);
    fake.broadcast(fake.nextEvent());
    await until(() => events.length === 2);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(events.map((e) => e.event.sequence)).toEqual([1, 2]);
  });

  it('treats a sequence gap as reconciliation required: state cleared, signal raised, next start fresh', async () => {
    open();
    await until(() => hellos === 1);
    fake.broadcast(fake.nextEvent()); // 1
    fake.broadcast(fake.eventAt(5)); // gap
    await until(() => reconciliations.length === 1);
    expect(reconciliations).toEqual(['sequence-gap']);
    expect(events).toHaveLength(1);
    expect(stream.cursor).toBeNull();
    await until(() => closes.length === 1);
    expect(closes[0]).toMatchObject({ reconcile: true, error: null });
    stream.connect(fake.url);
    await until(() => fake.resumes.length === 2);
    expect(fake.resumes[1].cursor).toBeUndefined();
  });

  it('does not call a new stream instance without a cursor a gap', async () => {
    open();
    await until(() => hellos === 1);
    fake.broadcast(fake.eventAt(40)); // first event of a fresh start may have any sequence
    await until(() => events.length === 1);
    expect(reconciliations).toEqual([]);
  });

  it('passes on a reconciliation-required message from the sidecar and starts fresh afterwards', async () => {
    open();
    await until(() => hellos === 1);
    fake.broadcast(fake.nextEvent());
    await until(() => events.length === 1);
    fake.onResume = (socket) => {
      socket.send(
        JSON.stringify({
          type: 'reconciliation-required',
          reason: 'evicted',
          snapshot: 'unavailable',
          streamInstanceId: fake.streamInstanceId,
        }),
      );
      socket.close(CLOSE_CODES.normal);
    };
    fake.killSockets();
    await until(() => closes.length === 1);
    stream.connect(fake.url);
    await until(() => reconciliations.length === 1);
    expect(reconciliations).toEqual(['evicted']);
    expect(stream.cursor).toBeNull();
    fake.onResume = null;
    stream.connect(fake.url);
    await until(() => fake.resumes.length === 3);
    expect(fake.resumes[2].cursor).toBeUndefined();
  });

  it('reports a rejected credential on the upgrade as unauthorized', async () => {
    fake.tokens = ['another-token-0123456789abcdef0123456789'];
    open();
    await until(() => closes.length === 1);
    expect(closes[0].error).toBeInstanceOf(SidecarUnauthorizedError);
  });

  it('sends a ping every interval and gives up when nothing arrives for two intervals', async () => {
    fake.answerPings = false;
    open(100);
    await until(() => hellos === 1);
    const helloAt = Date.now();
    await until(() => closes.length === 1, 3_000); // no pong: the half-open link is detected
    // The watchdog fires two intervals after the last message (the hello), not on a later interval tick.
    expect(Date.now() - helloAt).toBeLessThan(290);
    expect(fake.pings.length).toBeGreaterThanOrEqual(1);
    expect(closes[0].error).toBeInstanceOf(SidecarUnavailableError);
    expect(closes[0].error?.message).toMatch(/stopped answering pings/);
  });

  it('stays connected while the sidecar answers pings', async () => {
    // Pongs arrive within milliseconds; an interval this long keeps the two-interval watchdog far away.
    open(200);
    await until(() => fake.pings.length >= 3);
    expect(closes).toHaveLength(0);
  });

  it('keeps the cursor across a 1013 close and reports it without an error', async () => {
    open();
    await until(() => hellos === 1);
    fake.broadcast(fake.nextEvent());
    await until(() => events.length === 1);
    for (const socket of fake.sockets) socket.close(CLOSE_CODES.tryAgainLater, 'slow');
    await until(() => closes.length === 1);
    expect(closes[0]).toMatchObject({ code: CLOSE_CODES.tryAgainLater, error: null, reconcile: false });
    expect(stream.cursor).not.toBeNull();
  });

  it('closes with 1000 and reports nothing when told to disconnect', async () => {
    open();
    await until(() => hellos === 1);
    stream.disconnect();
    await until(() => fake.sockets.size === 0);
    expect(closes).toHaveLength(0);
    expect(fake.closeCodes).toEqual([CLOSE_CODES.normal]);
  });

  it('drops a socket whose peer never answers the close frame instead of waiting 30 s', async () => {
    open();
    await until(() => hellos === 1);
    for (const socket of fake.sockets) (socket as unknown as { _socket: { pause(): void } })._socket.pause();
    const client = (stream as unknown as { socket: WebSocket }).socket;
    stream.disconnect();
    await until(() => client.readyState === client.CLOSED, 2_500);
  });

  it('sends every request header on the upgrade, including the deadline and the credential', async () => {
    open();
    await until(() => hellos === 1);
    expect(fake.upgrades).toHaveLength(1);
    expect(fake.upgrades[0].headers).toMatchObject({
      'x-matter-wire-version': '1',
      'x-attraccess-version': HOST_VERSION,
      'x-matter-plugin-version': entry.plugin,
      'x-matter-sidecar-version': entry.sidecar,
      'x-correlation-id': expect.stringMatching(/^[0-9a-f-]{36}$/),
      'x-request-deadline-ms': expect.stringMatching(/^\d+$/),
      authorization: `Bearer ${TOKEN}`,
    });
  });

  it('reports a sidecar error message by its contract code, and an invalid message as a protocol error', async () => {
    fake.onResume = (socket) => fake.sendError(socket, 'unauthorized', 'The token was revoked.');
    open();
    await until(() => closes.length === 1);
    expect(closes[0].error).toBeInstanceOf(SidecarUnauthorizedError);
    expect(closes[0].error).toMatchObject({ message: 'The token was revoked.', status: undefined });
    fake.onResume = (socket) => socket.send('{"type":"nonsense"}');
    stream.connect(fake.url);
    await until(() => closes.length === 2);
    expect(closes[1].error).toMatchObject({ kind: 'unavailable', code: 'invalid_response' });
    expect(closes[1].error?.message).not.toMatch(/HTTP/);
  });

  it('reports an unexpected close code as such, not as a made-up network error', async () => {
    open();
    await until(() => hellos === 1);
    for (const socket of fake.sockets) socket.close(1011, 'internal');
    await until(() => closes.length === 1);
    expect(closes[0]).toMatchObject({ code: 1011, reconcile: false });
    expect(closes[0].error?.message).toContain('1011');
    expect(closes[0].error?.message).not.toMatch(/ECONNRESET/);
  });

  it('reports each connection only to the handlers it was opened with', async () => {
    open();
    await until(() => hellos === 1);
    const second: StreamClose[] = [];
    let secondHellos = 0;
    stream.connect(fake.url, {
      onHello: () => (secondHellos += 1),
      onEvent: () => undefined,
      onReconciliationRequired: () => undefined,
      onClose: (close) => second.push(close),
    });
    await until(() => secondHellos === 1);
    fake.killSockets();
    await until(() => second.length === 1);
    expect(hellos).toBe(1);
    expect(closes).toHaveLength(0);
  });
});
