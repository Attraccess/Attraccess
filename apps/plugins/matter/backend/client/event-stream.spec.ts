import { CLOSE_CODES, parseCursor } from '@attraccess/matter-contract';
import { FakeSidecar, HOST_VERSION, TOKEN, entry } from '../testing/fake-sidecar';
import { SeenEventIds, SidecarEventStream, type StreamClose, type StreamEvent } from './event-stream';
import { SidecarHttpClient } from './rest-client';
import { SidecarUnauthorizedError } from './errors';

const identity = { attraccessVersion: HOST_VERSION, pluginVersion: entry.plugin, sidecarVersion: entry.sidecar };

async function until(predicate: () => boolean, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

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

  it('sends a ping every interval and reconnects when nothing arrives for two intervals', async () => {
    fake.answerPings = false;
    open(40);
    await until(() => hellos === 1);
    await until(() => closes.length === 1, 3_000); // no pong: the half-open link is detected
    expect(fake.pings.length).toBeGreaterThanOrEqual(1);
    expect(closes[0].error).not.toBeNull();
  });

  it('stays connected while the sidecar answers pings', async () => {
    open(30);
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
  });
});
