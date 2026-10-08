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
  it('serializes desired configuration replacements in arrival order', async () => {
    let releaseShutdown!: () => void;
    let shutdownStarted!: () => void;
    const shutdown = new Promise<void>((resolve) => {
      releaseShutdown = resolve;
    });
    const started = new Promise<void>((resolve) => {
      shutdownStarted = resolve;
    });
    const delayedDevice = {
      write: async (point: Snapshot['physicalPoints'][number], value: boolean) => {
        if (!value) {
          shutdownStarted();
          await shutdown;
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
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(pulsedSnapshot),
      snapshot: pulsedSnapshot,
    });
    await transport.send(commands, validCommand({ action: 'pulse' }));

    const revisionTwo = transport.send(desired, {
      protocolVersion: 1,
      revision: 2,
      contentHash: hash(snapshot),
      snapshot,
    });
    await started;
    const revisionThree = transport.send(desired, {
      protocolVersion: 1,
      revision: 3,
      contentHash: hash(snapshot),
      snapshot,
    });
    releaseShutdown();
    await Promise.all([revisionTwo, revisionThree]);

    await transport.send(commands, validCommand({ id: 'revision-three', expectedConfigurationRevision: 3 }));
    expect(device.values.get('751-9301:0')).toBe(true);
  });

  it('keeps the previous configuration active when persisting a replacement fails', async () => {
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
    const persist = store.save.bind(store);
    jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full')).mockImplementation(persist);

    await transport.send(desired, { protocolVersion: 1, revision: 2, contentHash: hash(snapshot), snapshot });
    await transport.send(commands, validCommand({ id: 'revision-one', expectedConfigurationRevision: 1 }));
    await transport.send(commands, validCommand({ id: 'revision-two', expectedConfigurationRevision: 2 }));

    expect(device.values.get('751-9301:0')).toBe(true);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/acknowledgements',
        payload: expect.objectContaining({ id: 'revision-two', status: 'rejected', code: 'stale_revision' }),
      }),
    );
  });
});
