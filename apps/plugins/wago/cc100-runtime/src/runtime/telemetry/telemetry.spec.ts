import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../../runtime';
import {
  TestTransport,
  commands,
  createRuntimeFixture,
  desired,
  snapshot,
  validCommand,
} from '../../runtime.test-utils';

describe('WagoRuntime state and measurements', () => {
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
      transport: transport,
      device: device,
    });
    await runtime.start();
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(snapshot),
      snapshot: snapshot,
    });
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

  it('publishes typed integer-base-unit measurements with stream identity', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'import-energy',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt-hour', scale: 1, offset: 0, kind: 'cumulative' },
        },
      ],
    };
    device.values.set('751-9301:0', 1234);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
        payload: expect.objectContaining({
          channelId: 'import-energy',
          value: 1234000,
          unit: 'milliwatt-hour',
          kind: 'cumulative',
          sequence: expect.any(Number),
          timestamp: expect.any(String),
          streamId: expect.any(String),
        }),
      }),
    );
  });

  it('rounds scaled float measurements within floating-point precision', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1000, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:0', 1.001);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
        payload: expect.objectContaining({ channelId: 'power', value: 1001000, unit: 'milliwatt' }),
      }),
    );
  });

  it('rejects large fractional measurements', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:0', 1_000_000_000_000_000.25);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await runtime.publishMeasurements();

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/faults',
        payload: expect.objectContaining({ channelId: 'power', code: 'invalid_measurement_transform' }),
      }),
    );
    expect(transport.published).not.toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/measurements',
      }),
    );
  });

  it('uses a new measurement stream identity after a runtime restart', async () => {
    const metered: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'power',
          physicalPointId: 'meter',
          profile: 'meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'watt', scale: 1, offset: 0 },
        },
      ],
    };
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const firstTransport = new TestTransport();
    const firstRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: firstTransport,
      device: device,
    });
    device.values.set('751-9301:0', 1);
    await firstRuntime.start();
    await firstTransport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(metered),
      snapshot: metered,
    });
    await firstRuntime.publishMeasurements();
    const firstEvent = firstTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!firstEvent) throw new Error('first runtime did not publish a measurement');
    const firstMeasurement = firstEvent.payload as { sequence: number; streamId: string };

    const restartedTransport = new TestTransport();
    const restartedRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      pairingCode: '482931',
      prefix: 'attraccess/wago',
      store,
      transport: restartedTransport,
      device: device,
    });
    await restartedRuntime.start();
    await restartedRuntime.publishMeasurements();
    const restartedEvent = restartedTransport.published.find((event) => event.topic.endsWith('/measurements'));
    if (!restartedEvent) throw new Error('restarted runtime did not publish a measurement');
    const restartedMeasurement = restartedEvent.payload as { sequence: number; streamId: string };

    expect(restartedMeasurement).toEqual(
      expect.objectContaining({ sequence: expect.any(Number), streamId: expect.any(String) }),
    );
    expect(restartedMeasurement.streamId).not.toBe(firstMeasurement.streamId);
  });

  it('reserves operational message sequences without saving for every measurement', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport: transport,
      device: device,
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

  it('publishes canonical measurements in a boot stream', async () => {
    const measurementSnapshot: Snapshot = {
      version: 1,
      physicalPoints: [{ id: 'meter-1', hardwareProfile: '751-9301', channel: 1 }],
      logicalChannels: [
        {
          id: 'meter',
          physicalPointId: 'meter-1',
          profile: 'site-meter',
          capabilities: ['measurement'],
          disconnectPolicy: { mode: 'hold' },
          measurement: { unit: 'percent', scale: 1, offset: 0 },
        },
      ],
    };
    device.values.set('751-9301:1', 0.5);
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(measurementSnapshot),
      snapshot: measurementSnapshot,
    });

    await runtime.publishMeasurements();

    const published = transport.published.find((message) => message.topic.endsWith('/measurements'));
    if (!published) throw new Error('measurement was not published');
    expect(published.payload).toMatchObject({
      channelId: 'meter',
      unit: 'millipercent',
      value: 500,
      kind: 'live',
      streamId: expect.any(String),
    });
  });

  it('does not publish from a sequence range whose reservation failed to save', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport: transport,
      device: device,
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
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      store,
      transport: transport,
      device: device,
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
