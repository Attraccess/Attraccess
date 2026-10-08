import { runtimeVersion } from './../manifest.json';
import { MemoryDeviceAdapter } from './adapters';
import { JsonStateStore, WagoRuntime, hash, type Snapshot } from './runtime';
import { TestTransport, commands, createRuntimeFixture, desired, snapshot, validCommand } from './runtime.test-utils';

describe('WagoRuntime startup and connection policy', () => {
  let transport: TestTransport;

  let device: MemoryDeviceAdapter;

  let runtime: WagoRuntime;

  beforeEach(async () => {
    ({ transport, device, runtime } = await createRuntimeFixture());
  });

  it('forces hold-policy outputs off and rejects work while the server requires another image', async () => {
    const held = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' as const } }],
    };
    await transport.send(desired, {
      protocolVersion: 1,
      revision: 1,
      contentHash: hash(held),
      snapshot: held,
    });
    await transport.send(commands, validCommand());
    expect(await device.read(snapshot.physicalPoints[0])).toBe(true);
    await transport.send(desired, { runtimeImageId: `sha256:${'b'.repeat(64)}` });
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    await transport.send(commands, validCommand({ id: 'during-update' }));
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    expect(transport.published).toContainEqual(
      expect.objectContaining({
        payload: expect.objectContaining({ id: 'during-update', status: 'rejected', code: 'runtime_update' }),
      }),
    );
    await runtime.publishHeartbeat();
    expect(transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload).toEqual(
      expect.objectContaining({ readiness: expect.objectContaining({ ready: false, runtimeUpdate: true }) }),
    );
  });

  it('requires fresh server confirmation at startup and after reconnect, rejecting retained confirmations', async () => {
    const imageId = `sha256:${'a'.repeat(64)}`;
    const store = new JsonStateStore(`/tmp/wago-policy-${Date.now()}-${Math.random()}.json`);
    const held = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' as const } }],
    };
    await store.save({
      accepted: { revision: 1, contentHash: hash(held), snapshot: held },
      outputs: { load: true },
      commandIds: [],
    });
    await device.write(snapshot.physicalPoints[0], true);
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      runtimeImageId: imageId,
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    const token = () =>
      (
        transport.published.filter((item) => item.topic.endsWith('/heartbeat')).at(-1)?.payload as {
          runtimePolicyToken: string;
        }
      ).runtimePolicyToken;
    await transport.send(desired, { runtimeImageId: imageId, runtimePolicyToken: 'old-connection' });
    await transport.send(commands, validCommand());
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    const firstToken = token();
    await transport.send(desired, { runtimeImageId: imageId, runtimePolicyToken: firstToken });
    await transport.send(commands, validCommand({ id: 'confirmed' }));
    expect(await device.read(snapshot.physicalPoints[0])).toBe(true);
    await runtime.setConnected(false);
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    await runtime.setConnected(true);
    await new Promise(setImmediate);
    await runtime.publishHeartbeat();
    await transport.send(desired, { runtimeImageId: imageId, runtimePolicyToken: firstToken });
    await transport.send(commands, validCommand({ id: 'stale-policy' }));
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    expect(token()).not.toBe(firstToken);
    await transport.send(desired, { runtimeImageId: imageId, runtimePolicyToken: token() });
    await transport.send(commands, validCommand({ id: 'reconnected' }));
    expect(await device.read(snapshot.physicalPoints[0])).toBe(true);
  });

  it('retains image approval while retrying a failed failsafe shutdown', async () => {
    const imageId = `sha256:${'a'.repeat(64)}`;
    const store = new JsonStateStore(`/tmp/wago-policy-retry-${Date.now()}-${Math.random()}.json`);
    const held = {
      ...snapshot,
      logicalChannels: [{ ...snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' as const } }],
    };
    await store.save({
      accepted: { revision: 1, contentHash: hash(held), snapshot: held },
      outputs: { load: true },
      commandIds: [],
    });
    await device.write(snapshot.physicalPoints[0], true);
    const write = device.write.bind(device);
    let shutdownAvailable = false;
    jest.spyOn(device, 'write').mockImplementation(async (point, value) => {
      if (!value && !shutdownAvailable) throw new Error('shutdown unavailable');
      await write(point, value);
    });
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      runtimeImageId: imageId,
      store,
      transport: transport,
      device: device,
    });
    await runtime.start();
    const heartbeat = transport.published.filter((item) => item.topic.endsWith('/heartbeat')).at(-1)?.payload as {
      runtimePolicyToken: string;
    };
    await transport.send(desired, {
      runtimeImageId: imageId,
      runtimePolicyToken: heartbeat.runtimePolicyToken,
    });
    await transport.send(commands, validCommand({ id: 'shutdown-pending' }));
    expect(transport.published).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ id: 'shutdown-pending', code: 'runtime_update' }) }),
    );
    shutdownAvailable = true;
    await runtime.publishHeartbeat();
    expect(await device.read(snapshot.physicalPoints[0])).toBe(false);
    expect(transport.published.filter((item) => item.topic.endsWith('/state')).at(-1)?.payload).toEqual(
      expect.objectContaining({ readiness: expect.objectContaining({ ready: true }) }),
    );
    await transport.send(commands, validCommand({ id: 'shutdown-recovered' }));
    expect(await device.read(snapshot.physicalPoints[0])).toBe(true);
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
        runtimeVersion,
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
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot: snapshot },
      outputs: { load: true },
      commandIds: ['command-1'],
    });
    const discoveryRuntime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      enrollmentSecret: 'enrollment-secret',
      store,
      transport: transport,
      device: device,
    });

    await discoveryRuntime.receiveDiscoveryClaim(Buffer.from('{"username":"controller","password":"secret"}'));

    await expect(store.load()).resolves.toEqual({
      accepted: { revision: 3, contentHash: hash(snapshot), snapshot: snapshot },
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
          runtimeVersion,
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
      transport: transport,
      device: device,
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
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot: snapshot },
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
      transport: transport,
      device: device,
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

  it('retries interrupted startup without reloading state or duplicating established subscriptions', async () => {
    const subscribe = jest.spyOn(transport, 'subscribe');
    subscribe.mockImplementationOnce(async (topic, listener) => {
      transport.listeners.set(topic, listener);
    });
    subscribe.mockRejectedValueOnce(new Error('MQTT subscribe acknowledgment timed out'));
    const load = jest.fn(async () => ({ outputs: {}, commandIds: [] }));
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store: { load, save: async () => undefined },
      transport: transport,
      device: device,
    });
    await expect(runtime.start()).rejects.toThrow('timed out');
    await runtime.start();
    expect(load).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls.map(([topic]) => topic)).toEqual([desired, commands, commands]);
  });

  it('starts when reserving initial state telemetry fails', async () => {
    const store = new JsonStateStore(`/tmp/wago-runtime-${Date.now()}-${Math.random()}.json`);
    await store.save({
      accepted: { revision: 1, contentHash: hash(snapshot), snapshot: snapshot },
      outputs: { load: true },
      commandIds: [],
    });
    const save = jest.spyOn(store, 'save').mockRejectedValueOnce(new Error('disk full'));
    runtime = new WagoRuntime({
      hardwareId: 'cc100-1',
      prefix: 'attraccess/wago',
      pairingCode: '482931',
      store,
      transport: transport,
      device: device,
    });

    await expect(runtime.start()).resolves.toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(runtime.setConnected(false)).resolves.toBeUndefined();

    expect(save).toHaveBeenCalled();
    expect(device.values.get('751-9301:0')).toBe(false);
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
      transport: transport,
      device: device,
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
