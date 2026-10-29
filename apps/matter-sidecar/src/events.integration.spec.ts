import { formatCursor, serverMessageSchema, CLOSE_CODES } from '@attraccess/matter-contract';
import { WebSocket } from 'ws';
import { WsClient, http, startSidecar, validHeaders, type Running } from './testing/harness';

const resume = (cursor?: string) => ({ type: 'resume', wireVersion: 1, ...(cursor ? { cursor } : {}) });

describe('event stream', () => {
  let running: Running;
  afterEach(() => running?.stop());

  it('greets with hello and delivers lifecycle and capability events in one envelope', async () => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    await client.until(() => client.messages.length >= 1);
    expect(client.messages[0]).toMatchObject({
      type: 'hello',
      wireVersion: 1,
      streamInstanceId: running.sidecar.stream.streamInstanceId,
    });
    client.send(resume(formatCursor(running.sidecar.stream.streamInstanceId, 0)));
    await client.until(() => client.events().length === 2);
    const [started, capabilities] = client.events();
    expect(started.event).toMatchObject({ type: 'sidecar.lifecycle', sequence: 1, payload: { phase: 'started' } });
    expect(capabilities.event).toMatchObject({ type: 'sidecar.capabilities', sequence: 2 });
    for (const message of client.messages) expect(serverMessageSchema.safeParse(message).success).toBe(true);
    client.close();
  });

  it('keeps replay metadata stable and switches from replay to live without gaps or duplicates', async () => {
    running = await startSidecar();
    const { stream } = running.sidecar;
    stream.publish('device.state', { n: 1 });
    const first = await WsClient.connect(running.port);
    first.send(resume(formatCursor(stream.streamInstanceId, 0)));
    await first.until(() => first.events().length === 3);
    const replayed = first.events()[2].event;
    stream.publish('device.state', { n: 2 });
    await first.until(() => first.events().length === 4);

    const second = await WsClient.connect(running.port);
    second.send(resume(formatCursor(stream.streamInstanceId, 2)));
    await second.until(() => second.events().length === 2);
    stream.publish('device.state', { n: 3 });
    await second.until(() => second.events().length === 3);
    const sequences = second.events().map((message) => message.event.sequence);
    expect(sequences).toEqual([3, 4, 5]);
    expect(second.events()[0].event).toEqual(replayed);
    expect(new Set(second.events().map((message) => message.event.eventId)).size).toBe(3);
    first.close();
    second.close();
  });

  it('delivers only new events when resuming without a cursor', async () => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    client.send(resume());
    client.send({ type: 'ping', wireVersion: 1 });
    await client.until(() => client.messages.some((message) => message.type === 'pong'));
    expect(client.events()).toHaveLength(0);
    running.sidecar.stream.publish('device.state', {});
    await client.until(() => client.events().length === 1);
    client.close();
  });

  it.each([
    ['malformed', () => 'garbage'],
    ['foreign-stream', () => formatCursor('11111111-1111-4111-8111-111111111111', 1)],
    ['future', (id: string) => formatCursor(id, 500)],
  ])('answers reconciliation-required for a %s cursor and never fabricates a snapshot', async (reason, cursorFor) => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    client.send(resume(cursorFor(running.sidecar.stream.streamInstanceId)));
    await client.until(() => client.closed !== null);
    expect(client.messages.find((m) => m.type === 'reconciliation-required')).toMatchObject({
      reason,
      snapshot: 'unavailable',
    });
    expect(client.events()).toHaveLength(0);
  });

  it('reports evicted and expired cursors', async () => {
    const clock = { now: Date.now() };
    running = await startSidecar({ replayMaxEvents: 3, replayMaxAgeMs: 1_000 }, { now: () => clock.now });
    const { stream } = running.sidecar;
    for (let i = 0; i < 5; i += 1) stream.publish('device.state', { i });
    const evicted = await WsClient.connect(running.port);
    evicted.send(resume(formatCursor(stream.streamInstanceId, 1)));
    await evicted.until(() => evicted.closed !== null);
    expect(evicted.messages.find((m) => m.type === 'reconciliation-required')).toMatchObject({ reason: 'evicted' });

    clock.now += 5_000;
    const expired = await WsClient.connect(running.port);
    expired.send(resume(formatCursor(stream.streamInstanceId, 6)));
    await expired.until(() => expired.messages.length > 1 || expired.closed !== null);
    // The head cursor itself needs no replay, but anything older has expired.
    const old = await WsClient.connect(running.port);
    old.send(resume(formatCursor(stream.streamInstanceId, 4)));
    await old.until(() => old.closed !== null);
    expect(old.messages.find((m) => m.type === 'reconciliation-required')).toMatchObject({ reason: 'expired' });
    expired.close();
  });

  it('starts a new stream instance after a restart and treats old cursors as foreign', async () => {
    running = await startSidecar();
    const oldId = running.sidecar.stream.streamInstanceId;
    await running.stop();
    running = await startSidecar();
    expect(running.sidecar.stream.streamInstanceId).not.toBe(oldId);
    const client = await WsClient.connect(running.port);
    client.send(resume(formatCursor(oldId, 2)));
    await client.until(() => client.closed !== null);
    expect(client.messages.find((m) => m.type === 'reconciliation-required')).toMatchObject({
      reason: 'foreign-stream',
    });
  });

  it.each([
    ['invalid json', '{nope'],
    ['unknown type', { type: 'subscribe' }],
    ['wrong wire version', { type: 'resume', wireVersion: 2 }],
    ['extra field', { type: 'ping', wireVersion: 1, extra: true }],
  ])('validates every message for the whole connection (%s)', async (_n, message) => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    client.send(message);
    await client.until(() => client.closed !== null);
    expect(client.messages.find((m) => m.type === 'error')).toMatchObject({ error: { code: 'validation_failed' } });
    expect(client.closed?.code).toBe(CLOSE_CODES.policyViolation);
  });

  it('rejects binary messages and a second resume', async () => {
    running = await startSidecar();
    const binary = await WsClient.connect(running.port);
    binary.socket.send(Buffer.from([1, 2, 3]));
    await binary.until(() => binary.closed !== null);
    expect(binary.messages.some((m) => m.type === 'error')).toBe(true);

    const twice = await WsClient.connect(running.port);
    twice.send(resume());
    twice.send(resume());
    await twice.until(() => twice.closed !== null);
    expect(twice.messages.some((m) => m.type === 'error')).toBe(true);
  });

  it('closes oversized messages with 1009 in the websocket parser', async () => {
    running = await startSidecar({ maxMessageBytes: 1_024 });
    const client = await WsClient.connect(running.port);
    client.socket.send('x'.repeat(4_096));
    await client.until(() => client.closed !== null);
    expect(client.closed?.code).toBe(CLOSE_CODES.messageTooBig);
    expect((await fetchLive(running.port)).status).toBe(200);
  });

  it('closes a slow client that overflows its queue budget, counting error messages too', async () => {
    running = await startSidecar({ clientQueueBytes: 3_000 });
    const client = await WsClient.connect(running.port);
    client.send(resume());
    client.send({ type: 'ping', wireVersion: 1 });
    await client.until(() => client.messages.some((message) => message.type === 'pong'));
    for (let i = 0; i < 100; i += 1) running.sidecar.stream.publish('device.state', { pad: 'x'.repeat(200) });
    await client.until(() => client.closed !== null);
    expect(client.closed).toMatchObject({ code: CLOSE_CODES.tryAgainLater });
    expect(client.closed?.reason).toMatch(/reconnect with the last cursor/);
    expect((await fetchLive(running.port)).status).toBe(200);
  });

  it('closes a client whose error replies would exceed the budget', async () => {
    running = await startSidecar({ clientQueueBytes: 160 });
    const client = await WsClient.connect(running.port);
    await client.until(() => client.messages.length >= 1);
    client.send('{nope');
    await client.until(() => client.closed !== null);
    expect(client.closed?.code).toBe(CLOSE_CODES.tryAgainLater);
  });

  it('does not crash when the client resets the connection', async () => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    client.send(resume());
    client.socket.terminate();
    await new Promise((resolve) => setTimeout(resolve, 50));
    running.sidecar.stream.publish('device.state', {});
    expect((await fetchLive(running.port)).status).toBe(200);
  });

  it('answers ping with pong', async () => {
    running = await startSidecar();
    const client = await WsClient.connect(running.port);
    client.send({ type: 'ping', wireVersion: 1 });
    await client.until(() => client.messages.some((m) => m.type === 'pong'));
    client.close();
  });

  it('keeps unrelated sockets usable after a rejected upgrade', async () => {
    running = await startSidecar();
    await expect(WsClient.connect(running.port, validHeaders({ 'x-matter-wire-version': '9' }))).rejects.toThrow(
      'HTTP 426',
    );
    const client = await WsClient.connect(running.port);
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
    client.close();
  });
});

function fetchLive(port: number) {
  return http(port, 'GET', '/health/live');
}
