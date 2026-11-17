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
