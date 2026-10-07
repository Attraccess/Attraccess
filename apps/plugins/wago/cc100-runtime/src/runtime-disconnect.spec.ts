import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { TestTransport, snapshot, desired, commands, validCommand, createRuntimeFixture } from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('acknowledges duplicate commands and enforces immediate disconnect policy', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand());
    await transport.send(commands, validCommand({ value: false }));
    await runtime.setConnected(false);
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'command-1', status: 'duplicate', error: undefined }),
      }),
    );
  });

  it('does not postpone a watchdog shutdown for repeated disconnect notifications', async () => {
    jest.useFakeTimers();
    try {
      const watchdogSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'watchdog', timeoutMs: 100 } }],
      };
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(watchdogSnapshot),
        snapshot: watchdogSnapshot,
      });
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

      await runtime.setConnected(false);
      await jest.advanceTimersByTimeAsync(90);
      await runtime.setConnected(false);
      await jest.advanceTimersByTimeAsync(10);

      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('cancels a pending watchdog shutdown when reconnecting', async () => {
    jest.useFakeTimers();
    try {
      const watchdogSnapshot: Snapshot = {
        ...snapshot,
        logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'watchdog', timeoutMs: 100 } }],
      };
      await transport.send(desired, {
        protocolVersion: 1,
        revision: 1,
        contentHash: hash(watchdogSnapshot),
        snapshot: watchdogSnapshot,
      });
      await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

      await runtime.setConnected(false);
      await runtime.setConnected(true);
      await jest.advanceTimersByTimeAsync(100);

      expect(device.values.get('751-9301:0')).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  it('retries the aggregate immediate shutdown state after a state-store failure', async () => {
    const twoOutputs: Snapshot = {
      ...snapshot,
      physicalPoints: [...snapshot.physicalPoints, { id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        ...snapshot.logicalChannels,
        {
          ...snapshot.logicalChannels[0],
          id: 'load-2',
          physicalPointId: 'output-2',
        },
      ],
    };
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(twoOutputs),
      snapshot: twoOutputs,
    });
    await transport.send(commands, validCommand());
    await transport.send(commands, validCommand({ id: 'command-2', channelId: 'load-2' }));
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockImplementationOnce(persist).mockRejectedValueOnce(new Error('disk full'));

    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(device.values.get('751-9301:0')).toBe(false);
    expect(device.values.get('751-9301:1')).toBe(false);
    await expect(store.load()).resolves.toEqual(expect.objectContaining({ outputs: { load: false, 'load-2': false } }));
  });
});
