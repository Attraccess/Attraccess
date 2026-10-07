import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { TestTransport, desired, createRuntimeFixture } from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
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
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
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
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
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
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(metered), snapshot: metered });
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
      device,
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
      device,
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
});
