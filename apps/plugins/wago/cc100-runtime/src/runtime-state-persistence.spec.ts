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
  it('persists output and connection state changes', async () => {
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
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand());
    await runtime.setConnected(false);
    expect((await store.load()).outputs).toEqual({ load: false });
    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ connected: false, outputs: { load: false } }),
        retain: true,
      }),
    );
  });

  it('rejects numeric digital readback instead of publishing a false boolean', async () => {
    const numericFeedbackDevice = {
      write: async () => undefined,
      read: async () => 1,
    };
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: numericFeedbackDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          outputs: {},
          readiness: expect.objectContaining({ hardwareAvailable: false }),
        }),
      }),
    );
  });

  it('excludes feedback for outputs removed from the active configuration', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'command-1', channelId: 'load', action: 'set', value: true }));
    const noOutputs: Snapshot = { ...snapshot, logicalChannels: [] };
    await transport.send(commands, validCommand({ id: 'off-before-removal', value: false }));
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(noOutputs),
      snapshot: noOutputs,
    });

    expect(transport.published.filter((message) => message.topic.endsWith('/state')).at(-1)).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ outputs: {} }),
      }),
    );
  });

  it('serializes concurrent state saves', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await Promise.all([
      store.save({ outputs: { load: false }, commandIds: [] }),
      store.save({ outputs: { load: true }, commandIds: ['command-1'] }),
    ]);

    await expect(store.load()).resolves.toEqual({
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
    });
  });

  it('reserves operational message sequences without saving for every measurement', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport,
      device,
    });
    await runtime.start();
    const save = jest.spyOn(store, 'save');

    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).not.toHaveBeenCalled();
    expect(transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 1, value: 42 }),
      }),
    );
  });

  it('does not publish from a sequence range whose reservation failed to save', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport,
      device,
    });
    await runtime.start();
    runtime['sequence'] = 100;
    runtime['categorySequences'].set('measurements', 100);
    runtime['reservedSequence'] = 100;
    runtime['state'].sequence = 100;
    const persist = store.save.bind(store);
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await expect(
      runtime['publishOperational']('measurements', {
        timestamp: '2026-09-01T00:00:00.000Z',
        channelId: 'meter',
        unit: 'percent',
        value: 42,
      }),
    ).rejects.toThrow('disk full');
    expect(runtime['reservedSequence']).toBe(100);
    expect(runtime['state'].sequence).toBe(100);

    await runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:05.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 43,
    });

    expect(save).toHaveBeenCalledTimes(2);
    expect(transport.published.filter((message) => message.topic.endsWith('/measurements'))).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ sequence: 101, value: 43 }),
      }),
    );
  });

  it('does not let a concurrent state save overwrite a sequence reservation', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      pairingCode: 'fixture',
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport,
      device,
    });
    await runtime.start();
    runtime['sequence'] = 100;
    runtime['categorySequences'].set('measurements', 100);
    runtime['reservedSequence'] = 100;
    runtime['state'].sequence = 100;

    const publish = runtime['publishOperational']('measurements', {
      timestamp: '2026-09-01T00:00:00.000Z',
      channelId: 'meter',
      unit: 'percent',
      value: 42,
    });
    const saveClaim = runtime.receiveClaim({ username: 'controller', password: 'secret' });
    await Promise.all([publish, saveClaim]);

    await expect(store.load()).resolves.toEqual(
      expect.objectContaining({
        credentials: { username: 'controller', password: 'secret' },
        sequence: 200,
      }),
    );
  });
});
