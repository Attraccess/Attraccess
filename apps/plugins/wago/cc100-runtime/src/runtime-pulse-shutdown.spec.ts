import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot, type Transport } from './runtime';
import {
  TestTransport,
  pulsedSnapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('deactivates a pulse when retained state publication fails after it turns on', async () => {
    const snapshot = pulsedSnapshot;
    let failStatePublication = false;
    const failingTransport: Transport = {
      publish: async (topic, payload, options) => {
        if (failStatePublication && topic.endsWith('/state')) throw new Error('broker unavailable');
        await transport.publish(topic, payload, options);
      },
      subscribe: async (topic, listener) => transport.subscribe(topic, listener),
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport: failingTransport,
      device,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    failStatePublication = true;

    await transport.send(commands, validCommand({ action: 'pulse' }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('retries a failed scheduled pulse shutdown', async () => {
    const snapshot = pulsedSnapshot;
    const writes: boolean[] = [];
    let shutdownCompleted: () => void = () => undefined;
    const shutdown = new Promise<void>((resolve) => {
      shutdownCompleted = resolve;
    });
    const flakyDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (!value && writes.filter((written) => !written).length === 1) throw new Error('temporary shutdown failure');
        if (!value) shutdownCompleted();
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: flakyDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    await shutdown;

    expect(writes).toEqual([true, false, false]);
  });

  it('keeps active pulses until their deadline after applying a replacement configuration', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = pulsedSnapshot;
      const replacement: Snapshot = {
        ...snapshot,
        physicalPoints: [{ id: 'output-2', hardwareProfile: '751-9301', channel: 1 }],
        logicalChannels: [{ ...snapshot.logicalChannels[0], physicalPointId: 'output-2' }],
      };
      await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
      await transport.send(commands, validCommand({ action: 'pulse' }));

      await transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(replacement),
        snapshot: replacement,
      });

      await jest.advanceTimersByTimeAsync(9);
      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(1);
      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies configuration while a scheduled pulse shutdown keeps retrying', async () => {
    const snapshot = pulsedSnapshot;
    jest.useFakeTimers();
    let failShutdown = false;
    let shutdownAttempts = 0;
    const flakyDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (failShutdown && !value) {
          shutdownAttempts += 1;
          throw new Error('relay write failed');
        }
        device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
      transport,
      device: flakyDevice,
    });
    try {
      await runtime.start();
      await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
      await transport.send(commands, validCommand({ action: 'pulse' }));
      failShutdown = true;

      await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: hash(snapshot), snapshot });

      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 2, errors: [] }),
        }),
      );
      expect(shutdownAttempts).toBe(0);
      await jest.advanceTimersByTimeAsync(3_110);
      expect(shutdownAttempts).toBe(6);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(shutdownAttempts).toBe(7);

      failShutdown = false;
      await transport.send(desired, { protocolVersion: 1, revision: 3, contentHash: hash(snapshot), snapshot });

      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(5_000);
      expect(device.values.get('751-9301:0')).toBe(false);
      expect(transport.published).toContainEqual(
        expect.objectContaining({
          topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
          payload: expect.objectContaining({ revision: 3, errors: [] }),
        }),
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('shuts down a pulse that completes while configuration replacement is waiting', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    try {
      const snapshot = pulsedSnapshot;
      let releaseWrite!: () => void;
      let writeStarted!: () => void;
      const write = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const started = new Promise<void>((resolve) => {
        writeStarted = resolve;
      });
      const delayedDevice = {
        write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
          if (value) {
            writeStarted();
            await write;
          }
          device.values.set(`${point.hardwareProfile}:${point.channel}`, value);
        },
        read: async () => false,
      };
      runtime = new WagoRuntime({
        hardwareId: 'cc100-1',
        prefix: 'attraccess/wago',
        pairingCode: '482931',
        store: new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`),
        transport,
        device: delayedDevice,
      });
      await runtime.start();
      await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

      const pulse = transport.send(commands, validCommand({ action: 'pulse' }));
      await started;
      const replacement = transport.send(desired, {
        protocolVersion: 1,
        revision: 2,
        contentHash: hash(snapshot),
        snapshot,
      });
      releaseWrite();
      await Promise.all([pulse, replacement]);

      expect(device.values.get('751-9301:0')).toBe(true);
      await jest.advanceTimersByTimeAsync(20);
      expect(device.values.get('751-9301:0')).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
