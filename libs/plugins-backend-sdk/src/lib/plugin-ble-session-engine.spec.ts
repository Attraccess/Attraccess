import { PluginBleError } from './plugin-ble';
import { FakeBleClock, flushMicrotasks } from './plugin-ble-fake-clock';
import { BleSessionEngine, type BleSessionEngineDeps, type BleSessionLink } from './plugin-ble-session-engine';
import { normalizeBleProfile } from './plugin-ble-validation';

const profile = normalizeBleProfile({
  id: 'unit',
  services: [
    {
      uuid: 'fff0',
      characteristics: [
        { key: 'data', uuid: 'fff1', operations: ['read', 'write'], maxReadBytes: 8, maxWriteBytes: 8 },
        { key: 'events', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 8 },
      ],
    },
  ],
});

function link(overrides: Partial<BleSessionLink> = {}): BleSessionLink & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    read: async () => (calls.push('read'), Uint8Array.of(1)),
    write: async () => void calls.push('write'),
    subscribe: async () => void calls.push('subscribe'),
    unsubscribe: async () => void calls.push('unsubscribe'),
    disconnect: async () => void calls.push('disconnect'),
    ...overrides,
  };
}

function engine(connected: BleSessionLink, extra: Partial<BleSessionEngineDeps> = {}) {
  const clock = new FakeBleClock();
  const onClosed = jest.fn();
  const session = new BleSessionEngine({
    id: 's1',
    endpointId: 'e1',
    profile,
    clock,
    connect: async () => connected,
    onClosed,
    ...extra,
  });
  return { session, clock, onClosed };
}

describe('BleSessionEngine', () => {
  it('closes and frees the endpoint when registering the disconnect listener throws', async () => {
    const connected = link({
      onDisconnected: () => {
        throw new Error('driver bug');
      },
    });
    const { session, onClosed } = engine(connected);
    await expect(session.open({ leaseMs: 30_000, connectTimeoutMs: 15_000 })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
    await expect(session.closed).resolves.toEqual({ reason: 'error' });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(connected.calls).toContain('disconnect');
  });

  it('still resolves closed when the onClosed callback throws', async () => {
    const { session } = engine(link(), {
      onClosed: () => {
        throw new Error('boom');
      },
    });
    await session.open({ leaseMs: 30_000, connectTimeoutMs: 15_000 });
    await expect(session.close()).resolves.toBeUndefined();
    await expect(session.closed).resolves.toEqual({ reason: 'closed' });
  });

  it('settles operations even when the logger throws', async () => {
    const { session } = engine(link(), {
      log: () => {
        throw new Error('logger down');
      },
    });
    await session.open({ leaseMs: 30_000, connectTimeoutMs: 15_000 });
    await expect(session.handle.write('data', Uint8Array.of(1))).resolves.toBeUndefined();
    await expect(session.handle.read('data')).resolves.toEqual(Uint8Array.of(1));
  });

  it('logs the safe detail of a failed operation', async () => {
    const log = jest.fn();
    const failing = link({
      read: async () => {
        throw new PluginBleError('GATT_ERROR', 'read failed', { operation: 'read', detail: 'att:0x0a' });
      },
    });
    const { session } = engine(failing, { log });
    await session.open({ leaseMs: 30_000, connectTimeoutMs: 15_000 });
    await expect(session.handle.read('data')).rejects.toMatchObject({ code: 'GATT_ERROR' });
    await expect(session.handle.write('data', Uint8Array.of(1))).resolves.toBeUndefined();
    expect(log.mock.calls).toEqual([
      ['read', 'GATT_ERROR', expect.any(Number), 'att:0x0a'],
      ['write', 'ok', expect.any(Number), undefined],
    ]);
  });

  it('reports a stream it failed itself, but not one the link failed', async () => {
    const onStreamFailed = jest.fn();
    let deliver!: (value: Uint8Array) => void;
    let failFromLink!: (error: PluginBleError) => void;
    const connected = link({
      subscribe: async (request) => {
        deliver = request.onNotification;
        failFromLink = (error) => request.onError?.(error);
      },
    });
    const small = normalizeBleProfile({
      id: 'small',
      services: [
        {
          uuid: 'fff0',
          characteristics: [{ key: 'events', uuid: 'fff2', operations: ['notify'], maxNotificationBytes: 8 }],
        },
      ],
      limits: { maxNotificationQueue: 2 },
    });
    const { session } = engine(connected, { profile: small, onStreamFailed });
    await session.open({ leaseMs: 30_000, connectTimeoutMs: 15_000 });
    const stream = await session.handle.subscribe('events');
    for (let i = 0; i < 3; i++) deliver(Uint8Array.of(i));
    await expect(stream.next()).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW' });
    expect(onStreamFailed).toHaveBeenCalledTimes(1);
    expect(onStreamFailed).toHaveBeenCalledWith('NOTIFICATION_OVERFLOW', 'capacity 2');
    // Already ended: later notifications report nothing more.
    deliver(Uint8Array.of(9));
    const again = await session.handle.subscribe('events');
    failFromLink(new PluginBleError('NOTIFICATION_OVERFLOW', 'reader queue', { detail: 'queue' }));
    await expect(again.next()).rejects.toMatchObject({ code: 'NOTIFICATION_OVERFLOW', detail: 'queue' });
    deliver(new Uint8Array(9));
    expect(onStreamFailed).toHaveBeenCalledTimes(1);
    const third = await session.handle.subscribe('events');
    deliver(new Uint8Array(9));
    await expect(third.next()).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(onStreamFailed).toHaveBeenCalledTimes(2);
    expect(onStreamFailed.mock.calls[1][0]).toBe('PAYLOAD_TOO_LARGE');
  });

  it('lets a timed-out subscribe be retried while the old link call still hangs', async () => {
    let first = true;
    let finishFirst!: () => void;
    const connected = link({
      subscribe: () => {
        if (!first) return Promise.resolve();
        first = false;
        return new Promise<void>((resolve) => (finishFirst = resolve));
      },
    });
    const { session, clock } = engine(connected);
    await session.open({ leaseMs: 60_000, connectTimeoutMs: 15_000 });
    const timedOut = session.handle.subscribe('events').catch((error: PluginBleError) => error.code);
    await clock.advance(10_000);
    await expect(timedOut).resolves.toBe('TIMEOUT');
    const retry = await session.handle.subscribe('events');
    // The old call finishing late must not tear down the retry's subscription on the link.
    finishFirst();
    await flushMicrotasks();
    expect(connected.calls).not.toContain('unsubscribe');
    await retry.unsubscribe();
    expect(connected.calls).toContain('unsubscribe');
  });

  it('waits for a late link from a timed-out connect before it frees the endpoint', async () => {
    let deliver!: (value: BleSessionLink) => void;
    const late = link();
    const { session, clock, onClosed } = engine(late, {
      connect: () => new Promise<BleSessionLink>((resolve) => (deliver = resolve)),
    });
    const opening = session.open({ leaseMs: 30_000, connectTimeoutMs: 1_000 }).catch((e: PluginBleError) => e.code);
    await clock.advance(1_000);
    await expect(opening).resolves.toBe('TIMEOUT');
    expect(onClosed).not.toHaveBeenCalled();
    deliver(late);
    await flushMicrotasks();
    expect(late.calls).toEqual(['disconnect']);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
