import { MemoryDeviceAdapter } from '../../io/adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../../runtime';
import { TestTransport, commands, desired, snapshot as outputSnapshot, validCommand } from '../../runtime.test-utils';
import { MAX_SILENCE_MS } from './measurements';
import { meterFleet } from '../../../../shared/configuration-limits.test-utils';

// One 879-3020 meter: active power enabled, its other 130 readings disabled.
const metered: Snapshot = meterFleet(1, 1);
const meterValue = 'modbus:0';

const start = Date.parse('2026-10-30T10:00:00.000Z');

describe('on-change measurement publication', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let store: JsonStateStore;
  let runtime: WagoRuntime;

  const createRuntime = () =>
    new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
  const at = (offsetMs: number) => jest.setSystemTime(start + offsetMs);
  const apply = (revision = 1, configuration = metered) =>
    transport.send(desired, {
      protocolVersion: 1,
      revision,
      contentHash: hash(configuration),
      snapshot: configuration,
    });
  const measurements = () =>
    transport.published
      .filter((message) => message.topic.endsWith('/measurements'))
      .map((message) => message.payload as { channelId: string; value: number; timestamp: string });
  const faults = () =>
    transport.published
      .filter((message) => message.topic.endsWith('/faults'))
      .map((message) => message.payload as { channelId: string; code: string });
  const sampleTimes = () => measurements().map(({ timestamp }) => Date.parse(timestamp) - start);
  /** Waits until no state publication is queued or in flight. */
  const settleState = async () => {
    while (runtime['statePublication']) await runtime['statePublication'].catch(() => undefined);
  };
  /** Like MQTT: the disconnected state is refused, so the server only ever sees the reconnected one. */
  const disconnect = async () => {
    transport.connected = false;
    await runtime.setConnected(false);
    await settleState();
  };
  const reconnect = async () => {
    transport.connected = true;
    await runtime.setConnected(true);
    await settleState();
  };
  /** Holds the next publish to a topic ending in `suffix` until the returned function is called. */
  const hold = (suffix: string) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const publish = transport.publish.bind(transport);
    const spy = jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      if (topic.endsWith(suffix)) {
        spy.mockImplementation(publish);
        await gate;
      }
      return publish(topic, payload, options);
    });
    return release;
  };

  beforeEach(async () => {
    // Only the clock is faked: state files and the publication queue still use real timers.
    // Configuration is applied just before `start`: the server refuses samples taken in the same
    // millisecond as the state that announced it.
    jest.useFakeTimers({
      now: start - 1,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });
    transport = new TestTransport();
    device = new MemoryDeviceAdapter();
    store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    runtime = createRuntime();
    await runtime.start();
    device.values.set(meterValue, 100);
    await apply();
    await settleState();
    at(0);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('suppresses an unchanged reading and re-sends it as a fresh sample after the silence limit', async () => {
    await runtime.publishMeasurements();
    at(5_000);
    await runtime.publishMeasurements();
    at(MAX_SILENCE_MS - 1);
    await runtime.publishMeasurements();
    expect(measurements()).toHaveLength(1);

    at(MAX_SILENCE_MS);
    await runtime.publishMeasurements();
    at(MAX_SILENCE_MS + 5_000);
    device.values.set(meterValue, 101);
    await runtime.publishMeasurements();

    expect(measurements().map(({ value, timestamp }) => [value, timestamp])).toEqual([
      [100_000, new Date(start).toISOString()],
      [100_000, new Date(start + MAX_SILENCE_MS).toISOString()],
      [101_000, new Date(start + MAX_SILENCE_MS + 5_000).toISOString()],
    ]);
  });

  it('never reads, measures or faults a disabled channel', async () => {
    const read = jest.spyOn(device, 'read');
    await runtime.publishMeasurements();

    expect(read.mock.calls.map(([point]) => point.id)).toEqual(['meter-0/active-power']);
    expect([...measurements(), ...faults()].map(({ channelId }) => channelId)).toEqual(['meter-0.active-power']);
  });

  it('rejects a command for a disabled channel', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(outputSnapshot),
      snapshot: outputSnapshot,
    });
    const accepted = runtime['state'].accepted;
    if (!accepted) throw new Error('output configuration was not accepted');
    accepted.snapshot.logicalChannels[0].enabled = false;
    const write = jest.spyOn(device, 'write');

    await transport.send(commands, validCommand({ expectedConfigurationRevision: 2 }));

    expect(write).not.toHaveBeenCalled();
    expect(transport.published.at(-1)?.payload).toEqual(
      expect.objectContaining({ status: 'rejected', code: 'unknown_channel' }),
    );
  });

  it('rejects a queued command whose channel was disabled while it waited', async () => {
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(outputSnapshot),
      snapshot: outputSnapshot,
    });
    const accepted = runtime['state'].accepted;
    if (!accepted) throw new Error('output configuration was not accepted');
    let releaseWrite!: () => void;
    let writing!: () => void;
    const firstWrite = new Promise<void>((resolve) => (writing = resolve));
    const write = jest.spyOn(device, 'write').mockImplementationOnce(async () => {
      writing();
      await new Promise<void>((resolve) => (releaseWrite = resolve));
    });
    const first = transport.send(commands, validCommand({ expectedConfigurationRevision: 2 }));
    await firstWrite;
    const second = transport.send(
      commands,
      validCommand({ id: 'command-2', expectedConfigurationRevision: 2, value: false }),
    );
    // The second command passed admission and now waits in the channel queue behind the first write.
    await new Promise((resolve) => setImmediate(resolve));
    accepted.snapshot.logicalChannels[0].enabled = false;
    releaseWrite();
    await Promise.all([first, second]);

    expect(write).toHaveBeenCalledTimes(1);
    expect(transport.published.map(({ payload }) => payload)).toContainEqual(
      expect.objectContaining({ id: 'command-2', status: 'rejected', code: 'stale_revision' }),
    );
  });

  it('re-sends after a reconnect', async () => {
    await runtime.publishMeasurements();
    await disconnect();
    await reconnect();
    at(5_000);
    await runtime.publishMeasurements();

    expect(measurements()).toHaveLength(2);
  });

  it('re-sends after the first state following a reconnect, even when that state looks unchanged', async () => {
    await runtime.publishMeasurements();
    at(1_000);
    await disconnect();
    // The reconnected state matches the last one the server saw, but the server invalidates every
    // sample taken before it; one sent while it was still in flight must not suppress the next.
    const releaseState = hold('/state');
    transport.connected = true;
    await runtime.setConnected(true);
    at(2_000);
    await runtime.publishMeasurements();
    releaseState();
    await settleState();
    at(3_000);
    await runtime.publishMeasurements();

    expect(sampleTimes()).toEqual([0, 2_000, 3_000]);
  });

  it('keeps a bulk sample taken before a resync state unrecorded so the next sweep re-sends it', async () => {
    // Bulk reads share one acquisition timestamp and are yielded lazily while earlier publishes await.
    Object.assign(device, {
      async *readMeasurements(points: Snapshot['physicalPoints']) {
        const timestamp = new Date().toISOString();
        for (const point of points) yield { pointId: point.id, ok: true as const, raw: 100, timestamp };
      },
    });
    at(1_000);
    await apply(2, meterFleet(1, 2));
    await settleState();
    at(2_000);
    const releaseMeasurement = hold('/measurements');
    const sweep = runtime.publishMeasurements();
    at(3_000);
    await disconnect();
    await reconnect();
    releaseMeasurement();
    await sweep;
    at(4_000);
    await runtime.publishMeasurements();

    expect(measurements().map(({ channelId, timestamp }) => [channelId, Date.parse(timestamp) - start])).toEqual([
      ['meter-0.active-power', 2_000],
      ['meter-0.import-energy', 2_000],
      ['meter-0.active-power', 4_000],
      ['meter-0.import-energy', 4_000],
    ]);
  });

  it('resumes an unchanged reading when the wall clock steps back', async () => {
    at(10_000);
    await runtime.publishMeasurements();
    at(5_000);
    await runtime.publishMeasurements();

    expect(sampleTimes()).toEqual([10_000, 5_000]);
  });

  it('re-sends after the accepted revision changes', async () => {
    await runtime.publishMeasurements();
    await apply(2);
    at(5_000);
    await runtime.publishMeasurements();

    expect(measurements()).toHaveLength(2);
  });

  it('re-sends after hardware availability flips', async () => {
    let available = true;
    Object.assign(device, {
      checkAvailability: async () => {
        if (!available) throw new Error('DIN mount missing');
      },
    });
    await runtime.publishMeasurements();
    at(5_000);
    available = false;
    await runtime.pollInputs();
    at(5_001);
    await runtime.publishMeasurements();
    at(10_000);
    available = true;
    await runtime.pollInputs();
    at(10_001);
    await runtime.publishMeasurements();
    at(15_000);
    await runtime.publishMeasurements();

    expect(sampleTimes()).toEqual([0, 5_001, 10_001]);
  });

  it('does not let a sample from the same millisecond as a resync state suppress the next one', async () => {
    // The server refuses a sample not strictly newer than the state that invalidated older ones.
    await runtime.publishMeasurements();
    at(5_000);
    await disconnect();
    await reconnect();
    await runtime.publishMeasurements();
    at(6_000);
    await runtime.publishMeasurements();
    at(7_000);
    await runtime.publishMeasurements();

    expect(sampleTimes()).toEqual([0, 5_000, 6_000]);
  });

  it('re-sends after the runtime-update failsafe runs', async () => {
    await runtime.publishMeasurements();
    await runtime['applyRuntimeUpdateFailsafe']();
    at(5_000);
    await runtime.publishMeasurements();

    expect(measurements()).toHaveLength(2);
  });

  it('publishes the first sample after a restart even when the value is unchanged', async () => {
    await runtime.publishMeasurements();
    const restarted = createRuntime();
    await restarted.start();
    at(5_000);
    await restarted.publishMeasurements();

    expect(measurements()).toHaveLength(2);
    const streams = measurements().map((payload) => (payload as { streamId?: string }).streamId);
    expect(new Set(streams).size).toBe(2);
  });

  it('retries a sample the broker refused instead of treating it as reported', async () => {
    const publish = transport.publish.bind(transport);
    jest
      .spyOn(transport, 'publish')
      .mockImplementationOnce(async (topic) => {
        if (topic.endsWith('/measurements')) throw new Error('broker unavailable');
      })
      .mockImplementation(publish);
    await runtime.publishMeasurements();
    expect(measurements()).toHaveLength(0);
    at(5_000);
    await runtime.publishMeasurements();

    expect(measurements().map(({ timestamp }) => Date.parse(timestamp) - start)).toEqual([5_000]);
  });

  it('suppresses a repeated fault until a good sample or the silence limit', async () => {
    let failure: Error | undefined = Object.assign(new Error('meter offline'), { code: 'modbus_read_failed' });
    jest.spyOn(device, 'read').mockImplementation(async () => {
      if (failure) throw failure;
      return 100;
    });
    await runtime.publishMeasurements();
    at(5_000);
    await runtime.publishMeasurements();
    expect(faults()).toHaveLength(1);

    at(MAX_SILENCE_MS);
    await runtime.publishMeasurements();
    expect(faults()).toHaveLength(2);

    at(MAX_SILENCE_MS + 1_000);
    failure = Object.assign(new Error('bad reply'), { code: 'modbus_exception' });
    await runtime.publishMeasurements();
    expect(faults().map(({ code }) => code)).toEqual(['modbus_read_failed', 'modbus_read_failed', 'modbus_exception']);

    at(MAX_SILENCE_MS + 2_000);
    failure = undefined;
    await runtime.publishMeasurements();
    at(MAX_SILENCE_MS + 3_000);
    failure = Object.assign(new Error('bad reply'), { code: 'modbus_exception' });
    await runtime.publishMeasurements();
    at(MAX_SILENCE_MS + 4_000);
    failure = undefined;
    await runtime.publishMeasurements();

    expect(faults()).toHaveLength(4);
    // The sample after a fault is a keyframe even though its value equals the last one reported.
    expect(measurements().map(({ timestamp }) => Date.parse(timestamp) - start)).toEqual([
      MAX_SILENCE_MS + 2_000,
      MAX_SILENCE_MS + 4_000,
    ]);
  });

  it('reports a repeated fault again after a resync', async () => {
    jest
      .spyOn(device, 'read')
      .mockRejectedValue(Object.assign(new Error('meter offline'), { code: 'modbus_read_failed' }));
    await runtime.publishMeasurements();
    await disconnect();
    await reconnect();
    at(5_000);
    await runtime.publishMeasurements();

    expect(faults()).toHaveLength(2);
  });

  it('reports a repeated fault again when the wall clock steps back', async () => {
    jest
      .spyOn(device, 'read')
      .mockRejectedValue(Object.assign(new Error('meter offline'), { code: 'modbus_read_failed' }));
    at(10_000);
    await runtime.publishMeasurements();
    at(5_000);
    await runtime.publishMeasurements();

    expect(faults()).toHaveLength(2);
  });
});
