import { MemoryDeviceAdapter } from '../adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from '../runtime';
import {
  TestTransport,
  snapshot,
  pulsedSnapshot,
  desired,
  commands,
  validCommand,
  createRuntimeFixture,
} from '../runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it.each([true, false])('rejects set %s without cancelling a pending pulse shutdown', async (value) => {
    const snapshot = pulsedSnapshot;
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, validCommand({ id: 'pulse', action: 'pulse' }));
    await transport.send(commands, validCommand({ id: 'set', value }));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'set', status: 'rejected', code: 'unsupported_operation' }),
      }),
    );
    expect(device.values.get('751-9301:0')).toBe(false);
  });

  it('serializes commands for one channel in arrival order', async () => {
    const writes: boolean[] = [];
    let releaseFirst!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
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

    const first = transport.send(commands, validCommand({ id: 'first', value: true }));
    const second = transport.send(commands, validCommand({ id: 'second', value: false }));
    await started;
    expect(writes).toEqual([true]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(writes).toEqual([true, false]);
  });

  it('rejects a command that waits behind a write when its configuration changes', async () => {
    const writes: boolean[] = [];
    let releaseFirst!: () => void;
    let firstWriteStarted!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const delayedDevice = {
      write: async (_point: Snapshot['physicalPoints'][number], value: boolean) => {
        writes.push(value);
        if (writes.length === 1) {
          firstWriteStarted();
          await firstWrite;
        }
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

    const first = transport.send(commands, validCommand({ id: 'first' }));
    const second = transport.send(commands, validCommand({ id: 'second' }));
    await started;
    const replacement = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot,
    });
    releaseFirst();
    await Promise.all([first, second, replacement]);

    expect(writes).toEqual([true]);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'second', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });

  it('persists a command reservation before actuating the device', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    const reservingDevice = {
      write: async () => {
        expect((await store.load()).commandIds).toContain('command-1');
      },
      read: async () => false,
    };
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device: reservingDevice,
    });
    await runtime.start();
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });

    await transport.send(commands, validCommand());

    await expect(store.load()).resolves.toEqual(expect.objectContaining({ commandIds: ['command-1'] }));
  });
});
