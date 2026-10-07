import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash } from './runtime';
import { TestTransport, snapshot, desired, createRuntimeFixture } from './runtime.test-utils';

describe('WagoRuntime', () => {
  let transport: TestTransport;
  let device: MemoryDeviceAdapter;
  let runtime: WagoRuntime;
  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });
  it('applies a complete valid retained snapshot and reports its revision', async () => {
    await transport.send(desired, { protocolVersion: 1, revision: 1, contentHash: hash(snapshot), snapshot });
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/configuration/reported',
        payload: { revision: 1, contentHash: hash(snapshot), errors: [] },
        retain: true,
      }),
    );
  });

  it('publishes the required retained discovery announcement and persists a valid claim', async () => {
    await runtime.publishDiscoveryAnnouncement(1);
    expect(transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1',
      payload: expect.objectContaining({
        hardwareId: 'cc100-1',
        pairingCode: '482931',
        enrollmentSecret: 'enrollment-secret',
        protocolVersion: '1.0.0',
        runtimeVersion: '0.1.0',
        capabilities: expect.arrayContaining(['claim', 'heartbeat', 'configuration-v1']),
        sequence: expect.any(Number),
      }),
      retain: true,
    });
    await expect(
      runtime.receiveDiscoveryClaim(
        Buffer.from(
          '{"username":"controller","password":"secret","configuration":{"namespace":"customer/wago"},"acknowledgementToken":"claim-token"}',
        ),
      ),
    ).resolves.toEqual({ username: 'controller', password: 'secret', prefix: 'customer/wago' });
    expect(transport.published).toContainEqual({
      topic: 'attraccess/wago/discovery/cc100-1/claim/ack',
      payload: { acknowledgementToken: 'claim-token' },
      retain: undefined,
    });
    await expect(runtime.receiveDiscoveryClaim(Buffer.from('{"username":"controller"}'))).resolves.toBeUndefined();
  });

  it('preserves persisted runtime state when receiving a discovery claim before startup', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
    });
    const discoveryRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store,
      transport,
      device,
    });

    await discoveryRuntime.receiveDiscoveryClaim(Buffer.from('{"username":"controller","password":"secret"}'));

    await expect(store.load()).resolves.toEqual({
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
      commandExpiries: {},
      credentials: { username: 'controller', password: 'secret' },
    });
  });

  it('includes the pairing code in the backend-compatible heartbeat', async () => {
    await runtime.publishHeartbeat();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({
          hardwareId: 'cc100-1',
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '0.1.0',
        }),
      }),
    );
  });

  it('reports its launch image identity through a non-retained permanent heartbeat', async () => {
    const runtimeImageId = `sha256:${'a'.repeat(64)}`;
    const identified = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      runtimeImageId,
      store: { load: async () => ({ outputs: {}, commandIds: [] }), save: async () => undefined },
      transport,
      device,
    });
    await identified.start();
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({ runtimeImageId }),
        retain: undefined,
      }),
    );
  });

  it('activates disconnect handling before a stalled initial canonical heartbeat', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    device.values.set('751-9301:0', true);
    let activated!: () => void;
    const ready = new Promise<void>((resolve) => {
      activated = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const publish = transport.publish.bind(transport);
    jest.spyOn(transport, 'publish').mockImplementation(async (topic, payload, options) => {
      await publish(topic, payload, options);
      if (topic.endsWith('/heartbeat')) await held;
    });
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });
    const starting = runtime.start(async () => {
      activated();
    });
    await ready;
    await runtime.setConnected(false);
    expect(device.values.get('751-9301:0')).toBe(false);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        topic: 'attraccess/wago/v1/controllers/cc100-1/heartbeat',
        payload: expect.objectContaining({ timestamp: expect.any(String), streamId: expect.any(String), sequence: 1 }),
      }),
    );
    release();
    await starting;
  });

  it('starts when reserving initial state telemetry fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport,
      device,
    });

    await expect(runtime.start()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(save).toHaveBeenCalled();
    expect(device.values.get('751-9301:0')).toBe(false);
  });
});
