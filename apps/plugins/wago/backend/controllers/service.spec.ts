import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './entity';
import { WagoEnrollment } from './enrollment.entity';
import { controller, createWagoServiceFixture } from '../wago-service.test-fixture';
import { WagoService } from './service';

describe('WagoService connection monitoring', () => {
  const services: WagoService[] = [];

  afterEach(() => {
    services.splice(0).forEach((service) => service.onModuleDestroy());
  });

  function createService(
    controllers = [controller()],
    enrollments: WagoEnrollment[] = [],
    defaultMqttServerId: number | null = null,
  ) {
    return createWagoServiceFixture(services, controllers, enrollments, defaultMqttServerId);
  }

  it('lists an offline controller as stale after restarting runtime monitoring', async () => {
    const claimed = {
      ...controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    };
    const { service } = createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);

    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('stale');

    await service.setRuntimePolicy(
      claimed.id,
      `sha256:${'a'.repeat(64)}`,
      `sha256:${'b'.repeat(64)}`,
      'connection-token',
    );
    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('stale');
  });

  it('subscribes a migrated controller directly without contacting its unreachable previous broker', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, mqttServerId: 3 };
    const { service, context } = createService([claimed], [], 2);
    const handlers = new Map<
      string,
      (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>
    >();
    jest.mocked(context.mqtt.subscribe).mockImplementation(async (serverId, topic, handler) => {
      if (serverId === 2) throw new Error('old-broker-unreachable');
      handlers.set(topic, handler as (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>);
      return { unsubscribe: jest.fn() };
    });
    const heartbeat = jest
      .spyOn(service as unknown as { onHeartbeat(id: string, payload: Buffer): Promise<void> }, 'onHeartbeat')
      .mockResolvedValue(undefined);
    await service.refreshNetworkConnection(1);
    expect(context.mqtt.subscribe).toHaveBeenCalledTimes(6);
    expect(jest.mocked(context.mqtt.subscribe).mock.calls.every(([serverId]) => serverId === 3)).toBe(true);
    const topic = 'attraccess/wago/v1/controllers/cc100-01/heartbeat',
      payload = Buffer.from('device-heartbeat');
    await handlers.get(topic)?.({ serverId: 2, topic, payload });
    expect(heartbeat).not.toHaveBeenCalled();
    await handlers.get(topic)?.({ serverId: 3, topic, payload });
    expect(heartbeat).toHaveBeenCalledWith('cc100-01', payload);
  });

  it('checks software after restarting runtime monitoring until the running image is confirmed', async () => {
    const claimed = {
      ...controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date().toISOString(),
    };
    const { service } = createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);

    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('runtime_check');

    const image = `sha256:${'a'.repeat(64)}`;
    await service.setRuntimePolicy(claimed.id, image, image, 'connection-token');
    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(false);
    expect((await service.list())[0].connectivity).toBe('online');
  });

  it('restores migrated controller subscriptions after API restart while the previous default broker is unreachable', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, mqttServerId: 3 };
    const { service, context } = createService([claimed], [], 2);
    const handlers = new Map<
      string,
      (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>
    >();
    jest.mocked(context.mqtt.subscribe).mockImplementation(async (serverId, topic, handler) => {
      if (serverId === 2) throw new Error('previous broker unreachable');
      handlers.set(topic, handler as (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>);
      return { unsubscribe: jest.fn() };
    });
    const heartbeat = jest
      .spyOn(service as unknown as { onHeartbeat(id: string, payload: Buffer): Promise<void> }, 'onHeartbeat')
      .mockResolvedValue(undefined);

    await service.onApplicationBootstrap();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/heartbeat';
    await handlers.get(topic)?.({ serverId: 3, topic, payload: Buffer.from('fresh heartbeat') });

    expect(heartbeat).toHaveBeenCalledWith('cc100-01', Buffer.from('fresh heartbeat'));
    expect(handlers.size).toBe(6);
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('during startup'));
  });

  it('keeps the migrated broker active when an overlapping rebuild captured its previous association', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context } = createService([claimed], [], 2);
    const rebuild = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(service);
    await rebuild();
    let finish!: () => void;
    const stale = { unsubscribe: jest.fn() },
      migrated = { unsubscribe: jest.fn() };
    jest.mocked(context.mqtt.subscribe).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(stale);
        }),
    );
    const overlapping = rebuild();
    await new Promise<void>((resolve) => setImmediate(resolve));
    let heartbeatHandler!: (message: { serverId: number; topic: string; payload: Buffer }) => Promise<void>;
    jest.mocked(context.mqtt.subscribe).mockImplementation(async (serverId, topic, handler) => {
      if (serverId === 3 && topic.endsWith('/heartbeat')) heartbeatHandler = handler as typeof heartbeatHandler;
      return serverId === 3 ? migrated : { unsubscribe: jest.fn() };
    });
    const heartbeat = jest
      .spyOn(service as unknown as { onHeartbeat(id: string, payload: Buffer): Promise<void> }, 'onHeartbeat')
      .mockResolvedValue(undefined);
    claimed.mqttServerId = 3;
    await service.refreshNetworkConnection(1);
    finish();
    await overlapping;
    await heartbeatHandler({
      serverId: 3,
      topic: 'attraccess/wago/v1/controllers/cc100-01/heartbeat',
      payload: Buffer.from('new connection'),
    });
    expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
    expect(migrated.unsubscribe).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledWith('cc100-01', Buffer.from('new connection'));
  });

  it('lists a connected mismatched runtime in a dedicated update status and publishes a connection-bound policy', async () => {
    const claimed = {
      ...controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date().toISOString(),
    };
    const { service, context, revisionRepository } = createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);
    expect((await service.list())[0].connectivity).toBe('runtime_check');
    revisionRepository.find.mockResolvedValueOnce([
      { revision: 1, snapshot: JSON.stringify({ logicalChannels: [{ id: 'load', capabilities: ['output'] }] }) },
    ]);
    await expect(
      service.executeCommand({
        controllerId: 1,
        channelId: 'load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
      }),
    ).rejects.toThrow('Runtime update required');
    expect(context.mqtt.publish).not.toHaveBeenCalled();
    const desired = `sha256:${'a'.repeat(64)}`;
    await service.setRuntimePolicy(1, desired, `sha256:${'b'.repeat(64)}`, 'connection-token');
    expect((await service.list())[0].connectivity).toBe('runtime_update');
    expect(context.mqtt.publish).toHaveBeenCalledWith(
      2,
      expect.stringContaining('configuration/desired'),
      JSON.stringify({ runtimeImageId: desired, runtimePolicyToken: 'connection-token' }),
      { qos: 1, retain: false },
    );
    await service.setRuntimePolicy(1, desired, desired, 'connection-token');
    expect((await service.list())[0].connectivity).toBe('online');
  });

  it.each([1, 2])(
    'retries runtime policy after publication %s fails without unblocking commands',
    async (failedPublication) => {
      const { service, context, revisionRepository } = createService([{ ...controller(), trustState: 'claimed' }]);
      service.registerRuntimeStatusHandler(() => undefined);
      revisionRepository.find.mockResolvedValue([{ revision: 1, state: 'published', snapshot: '{}' }]);
      const publish = jest.mocked(context.mqtt.publish);
      if (failedPublication === 2) publish.mockResolvedValueOnce(undefined);
      publish.mockRejectedValueOnce(new Error('broker unavailable'));
      const image = `sha256:${'a'.repeat(64)}`;
      await expect(service.setRuntimePolicy(1, image, image, 'boot-token')).rejects.toThrow('broker unavailable');
      expect(service.isRuntimeUpdateRequired(1)).toBe(true);
      publish.mockClear();
      await service.setRuntimePolicy(1, image, image, 'boot-token');
      expect(publish).toHaveBeenCalledTimes(2);
      expect(service.isRuntimeUpdateRequired(1)).toBe(false);
    },
  );

  it('does not expose physical-verification secrets in controller listings', async () => {
    const { service } = createService();

    const [listed] = await service.list();

    expect(listed).not.toHaveProperty('fingerprint');
    expect(listed).not.toHaveProperty('pairingCodeHash');
  });

  it('resolves repositories only after the host module initializes', async () => {
    const context = { getRepository: jest.fn() } as unknown as PluginContext;
    new WagoService(context);

    expect(context.getRepository).not.toHaveBeenCalled();
  });

  it('retries MQTT subscriptions instead of failing module startup', async () => {
    const { service, context } = createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not establish WAGO MQTT subscriptions during startup'),
    );
    service.onModuleDestroy();
  });

  it('creates default settings when none have been persisted', async () => {
    const { service, settingsRepository, settingsQuery } = createService();
    settingsRepository.findOneBy.mockResolvedValue(null);
    settingsRepository.findOneByOrFail.mockResolvedValue({
      id: 1,
      defaultMqttServerId: null,
      operationalPrefix: 'attraccess/wago',
    });

    await expect(service.getSettings()).resolves.toEqual({
      id: 1,
      defaultMqttServerId: null,
      operationalPrefix: 'attraccess/wago',
    });
    expect(settingsQuery.values).toHaveBeenCalledWith({
      id: 1,
      defaultMqttServerId: null,
      operationalPrefix: 'attraccess/wago',
    });
    expect(settingsQuery.orIgnore).toHaveBeenCalled();
  });

  it('does not overwrite a default MQTT server configured while settings are initialized', async () => {
    const { service, settingsRepository, settingsQuery } = createService();
    settingsRepository.findOneBy.mockResolvedValue(null);
    settingsQuery.execute.mockImplementation(async () => {
      settingsRepository.findOneByOrFail.mockResolvedValue({
        id: 1,
        defaultMqttServerId: 2,
        operationalPrefix: 'attraccess/wago',
      });
    });

    await expect(service.getSettings()).resolves.toEqual({
      id: 1,
      defaultMqttServerId: 2,
      operationalPrefix: 'attraccess/wago',
    });
    expect(settingsQuery.orIgnore).toHaveBeenCalled();
  });

  it('keeps the host running when initial WAGO MQTT subscriptions fail', async () => {
    const { service, context } = createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockRejectedValue(new Error('broker unavailable'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(context.logger.warn).toHaveBeenCalledWith(
      'Could not establish WAGO MQTT subscriptions during startup: Error: broker unavailable',
    );
    service.onModuleDestroy();
  });

  it('fails startup when WAGO subscription configuration cannot be read', async () => {
    const { service, context, settingsRepository } = createService([], [], 2);
    settingsRepository.findOneBy.mockRejectedValue(new Error('settings unavailable'));

    await expect(service.onApplicationBootstrap()).rejects.toThrow('settings unavailable');

    expect(context.logger.warn).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('preserves the MQTT server during a prefix-only settings update', async () => {
    const { service, settingsRepository } = createService([], [], 2);

    await service.setSettings(undefined, 'customer/wago');

    expect(settingsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultMqttServerId: 2, operationalPrefix: 'customer/wago' }),
    );
  });

  it('requires a non-empty matching fingerprint', () => {
    const { service } = createService();
    const matchesVerifier = Reflect.get(service, 'matchesVerifier') as (item: WagoController, value: string) => boolean;

    expect(matchesVerifier(controller(), '')).toBe(false);
  });

  it('accepts a heartbeat that omits the optional sequence', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, controllerRepository } = createService([claimed]);
    const onHeartbeat = (
      Reflect.get(service, 'onHeartbeat') as (hardwareId: string, payload: Buffer) => Promise<void>
    ).bind(service);

    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
        }),
      ),
    );

    expect(controllerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ lastSequence: 4 }));
  });

  it('does not overwrite newly committed broker or credential bindings with an in-flight old heartbeat', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, credentialEpoch: 'old-epoch' };
    const { service, controllerRepository } = createService([claimed]);
    controllerRepository.findOneBy.mockResolvedValue({ ...claimed });
    controllerRepository.save.mockImplementation(async (snapshot) => {
      // The SSH transaction commits after the heartbeat read and before its save.
      claimed.mqttServerId = 3;
      claimed.credentialEpoch = 'new-epoch';
      Object.assign(claimed, snapshot);
      return claimed;
    });
    const onHeartbeat = (Reflect.get(service, 'onHeartbeat') as (id: string, payload: Buffer) => Promise<void>).bind(
      service,
    );
    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
        }),
      ),
    );
    expect(claimed.mqttServerId).toBe(3);
    expect(claimed.credentialEpoch).toBe('new-epoch');
    expect(claimed.lastHeartbeatAt).toBeTruthy();
  });

  it('persists a valid canonical heartbeat when the bounded diagnostics cache is full', async () => {
    const claimed = { ...controller(), id: 257, trustState: 'claimed' as const };
    const { service, controllerRepository } = createService([claimed]);
    const updateEvidence = jest.fn();
    service.registerRuntimeStatusHandler(updateEvidence);
    const timestamp = new Date().toISOString();
    const streamId = '00000000-0000-4000-8000-000000000001';
    for (let id = 1; id <= 256; id++) {
      service.diagnostics.ingest(id, 'heartbeat', Buffer.from(JSON.stringify({ timestamp, streamId, sequence: 1 })));
    }
    const onHeartbeat = (
      Reflect.get(service, 'onHeartbeat') as (hardwareId: string, payload: Buffer) => Promise<void>
    ).bind(service);

    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
          timestamp,
          streamId,
          sequence: 1,
          runtimeImageId: `sha256:${'a'.repeat(64)}`,
        }),
      ),
    );

    expect(service.diagnostics.read(claimed.id).heartbeatAt).toBeUndefined();
    expect(updateEvidence).toHaveBeenCalledWith(
      claimed.id,
      expect.objectContaining({ imageId: `sha256:${'a'.repeat(64)}`, streamId, sequence: 1 }),
    );
    expect(controllerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastHeartbeatAt: timestamp, lastSeenAt: expect.any(String) }),
    );
  });

  it('does not regress a persisted heartbeat with an older canonical heartbeat when the diagnostics cache is full', async () => {
    const timestamp = new Date(Date.now() - 60_000).toISOString();
    const claimed = {
      ...controller(),
      id: 257,
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date(Date.now()).toISOString(),
      lastSeenAt: new Date(Date.now() - 31_000).toISOString(),
    };
    const { service, controllerRepository } = createService([claimed]);
    const streamId = '00000000-0000-4000-8000-000000000001';
    for (let id = 1; id <= 256; id++) {
      service.diagnostics.ingest(id, 'heartbeat', Buffer.from(JSON.stringify({ timestamp, streamId, sequence: 1 })));
    }
    const onHeartbeat = (
      Reflect.get(service, 'onHeartbeat') as (hardwareId: string, payload: Buffer) => Promise<void>
    ).bind(service);

    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
          timestamp,
          streamId,
          sequence: 1,
        }),
      ),
    );

    expect(controllerRepository.save).not.toHaveBeenCalled();
    expect(claimed.lastHeartbeatAt).not.toBe(timestamp);
  });

  it('keeps replacement subscriptions inert until they replace the active generation', async () => {
    const { service, context, subscriptions } = createService([], [], 2);
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(
      service,
    );

    await subscribeConfiguredServers();
    const firstCallback = (context.mqtt.subscribe as jest.Mock).mock.calls[0][2] as (message: {
      topic: string;
      payload: Buffer;
    }) => Promise<void>;
    let finishSubscription!: () => void;
    let secondCallback!: (message: { topic: string; payload: Buffer }) => Promise<void>;
    (context.mqtt.subscribe as jest.Mock).mockImplementationOnce((_serverId, _topic, callback) => {
      secondCallback = callback;
      return new Promise((resolve) => {
        finishSubscription = () => {
          const subscription = { unsubscribe: jest.fn() };
          subscriptions.push(subscription);
          resolve(subscription);
        };
      });
    });
    const rebuild = subscribeConfiguredServers();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const message = { topic: 'attraccess/wago/discovery/cc100-01', payload: Buffer.from('{}') };

    const onDiscovery = jest
      .spyOn(service as unknown as { onDiscovery: WagoService['onDiscovery'] }, 'onDiscovery')
      .mockResolvedValue(undefined);
    await secondCallback(message);
    expect(onDiscovery).not.toHaveBeenCalled();

    finishSubscription();
    await rebuild;
    await firstCallback(message);
    await secondCallback(message);
    expect(onDiscovery).toHaveBeenCalledTimes(1);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('preserves retained state delivered before replacement subscriptions activate', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context } = createService([claimed], [], 2);
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(
      service,
    );
    await subscribeConfiguredServers();
    const retained = Buffer.from(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        streamId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        connected: true,
        revision: 1,
        contentHash: 'a'.repeat(64),
        outputs: { relay: true },
      }),
    );
    (context.mqtt.subscribe as jest.Mock).mockImplementation(async (_serverId, topic, callback) => {
      if (topic.endsWith('/state')) await callback({ topic, payload: retained });
      return { unsubscribe: jest.fn() };
    });

    await subscribeConfiguredServers();

    expect(service.diagnostics.read(claimed.id).outputs.relay.value).toBe(true);
  });

  it('unsubscribes an in-flight replacement when the module is destroyed', async () => {
    let finishSubscribe!: () => void;
    const { service, context, subscriptions } = createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSubscribe = () => {
            const subscription = { unsubscribe: jest.fn() };
            subscriptions.push(subscription);
            resolve(subscription);
          };
        }),
    );
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(
      service,
    );

    const rebuild = subscribeConfiguredServers();
    await new Promise<void>((resolve) => setImmediate(resolve));
    service.onModuleDestroy();
    finishSubscribe();
    await rebuild;

    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
  });
});
