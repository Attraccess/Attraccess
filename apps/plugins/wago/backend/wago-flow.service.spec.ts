import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoFlowService } from './wago-flow.service';
import { WagoSettings } from './wago-settings.entity';

describe('WagoFlowService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
  });
  afterEach(() => jest.useRealTimers());
  const controller = { id: 1, hardwareId: 'cc100-01', trustState: 'claimed', mqttServerId: null } as WagoController;
  const revision = {
    controllerId: 1,
    state: 'applied',
    snapshot: JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['output'] }] }),
  } as WagoConfigurationRevision;

  function createService() {
    const trigger = jest.fn().mockResolvedValue(undefined);
    const controllerRepository = { find: jest.fn().mockResolvedValue([controller]), findOneBy: jest.fn() };
    const revisionQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([revision]),
    };
    const revisionRepository = {
      find: jest.fn().mockResolvedValue([revision]),
      createQueryBuilder: jest.fn().mockReturnValue(revisionQuery),
    };
    const settingsRepository = {
      findOneBy: jest
        .fn()
        .mockResolvedValue({ id: 1, defaultMqttServerId: 2, operationalPrefix: 'attraccess/wago' } as WagoSettings),
    };
    const context = {
      getRepository: jest.fn((entity) =>
        entity === WagoController
          ? controllerRepository
          : entity === WagoConfigurationRevision
            ? revisionRepository
            : settingsRepository,
      ),
      logger: { warn: jest.fn() },
      flows: { trigger },
      mqtt: { subscribe: jest.fn().mockResolvedValue({ unsubscribe: jest.fn() }) },
    } as unknown as PluginContext;
    return { service: new WagoFlowService(context), trigger, context, revisionQuery, revisionRepository };
  }

  it('caches a validated retained state and dispatches matching trigger nodes', async () => {
    const { service, trigger, context } = createService();
    await service.refresh();
    await service['onMessage'](
      2,
      'attraccess/wago',
      'attraccess/wago/v1/controllers/cc100-01/state',
      Buffer.from(
        JSON.stringify({
          sequence: 1,
          timestamp: '2026-08-30T00:00:00.000Z',
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: true },
        }),
      ),
    );
    expect(service.read({ controllerId: 1, channelId: 'door' })).toMatchObject({ value: true, sequence: 1 });
    expect(trigger).toHaveBeenCalledWith(
      'plugin.wago.event-received',
      expect.any(Function),
      expect.objectContaining({ wago: expect.objectContaining({ channelId: 'door', value: true }) }),
    );
    expect(context.getRepository(WagoController).findOneBy).not.toHaveBeenCalled();
  });

  it('ignores duplicate sequences and resolves waiters from later state', async () => {
    const { service, trigger } = createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, value: boolean) =>
      Buffer.from(
        JSON.stringify({
          sequence,
          timestamp: new Date().toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: value },
        }),
      );
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, false));
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 100,
    });
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, true));
    await service['onMessage'](2, 'attraccess/wago', topic, event(2, true));
    await expect(waiting).resolves.toMatchObject({ value: true, sequence: 2 });
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('only evaluates waiters for the updated channel state', async () => {
    const { service } = createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (outputs: Record<string, boolean>) =>
      Buffer.from(
        JSON.stringify({
          sequence: 1,
          timestamp: '2026-08-30T00:00:00.000Z',
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs,
        }),
      );
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 100,
    });
    const read = jest.spyOn(service, 'read');

    await service['onMessage'](2, 'attraccess/wago', topic, event({ door: false }));

    expect(read).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(100);
    await expect(waiting).resolves.toBeNull();
  });

  it('cancels pending state waits during shutdown', async () => {
    const { service } = createService();
    const waiting = service.wait({
      controllerId: 1,
      channelId: 'door',
      category: 'state',
      equals: true,
      timeoutMs: 2_147_483_647,
    });
    service.onModuleDestroy();
    await expect(waiting).resolves.toBeNull();
    expect(service['waiters'].size).toBe(0);
  });

  it('loads only the latest applied revision per controller and prunes removed channel state', async () => {
    const { service, revisionQuery, revisionRepository } = createService();
    await service.refresh();
    await service['onMessage'](
      2,
      'attraccess/wago',
      'attraccess/wago/v1/controllers/cc100-01/state',
      Buffer.from(
        JSON.stringify({
          sequence: 1,
          timestamp: '2026-08-30T00:00:00.000Z',
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: true },
        }),
      ),
    );
    revisionQuery.getMany.mockResolvedValueOnce([]);

    await service.refresh();

    expect(revisionRepository.find).not.toHaveBeenCalled();
    expect(revisionRepository.createQueryBuilder).toHaveBeenCalledTimes(2);
    expect(revisionQuery.innerJoin).toHaveBeenCalledWith(
      expect.any(Function),
      'latest',
      'latest.controllerId = revision.controllerId AND latest.revision = revision.revision',
    );
    expect(service.read({ controllerId: 1, channelId: 'door' })).toBeNull();
  });

  it('isolates messages from another MQTT server and accepts a newer controller restart', async () => {
    const { service } = createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number, timestamp: string, value: boolean) =>
      Buffer.from(
        JSON.stringify({
          sequence,
          timestamp,
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: value },
        }),
      );
    await service['onMessage'](3, 'attraccess/wago', topic, event(1, '2026-08-30T00:00:00.000Z', true));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toBeNull();
    await service['onMessage'](2, 'attraccess/wago', topic, event(10, '2026-08-30T00:00:00.000Z', false));
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, '2026-08-30T00:01:00.000Z', true));
    expect(service.read({ controllerId: 1, channelId: 'door', category: 'state' })).toMatchObject({
      sequence: 1,
      value: true,
    });
  });

  it('uses source timestamps for stale state and returns node-specific schemas', async () => {
    const { service } = createService();
    await service.refresh();
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    await service['onMessage'](
      2,
      'attraccess/wago',
      topic,
      Buffer.from(
        JSON.stringify({
          sequence: 1,
          timestamp: new Date(Date.now() - 90_001).toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: true },
        }),
      ),
    );
    const state = service.read({ controllerId: 1, channelId: 'door', category: 'state' });
    expect(state && service.payload(state)).toMatchObject({ stale: true });
    const eventSchema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door' }, 'event');
    const waitSchema = await service.resolveConfigSchema(
      { controllerId: 1, channelId: 'door', category: 'state' },
      'wait',
    );
    expect(eventSchema).toMatchObject({
      required: ['controllerId', 'channelId', 'category'],
      properties: { minimumIntervalMs: expect.any(Object) },
    });
    expect(waitSchema).toMatchObject({ properties: { equals: { type: 'boolean' }, timeoutMs: expect.any(Object) } });
    expect((waitSchema.properties as Record<string, { maximum: number }>).timeoutMs.maximum).toBe(2_147_483_647);
  });

  it.each(['event', 'read', 'wait'] as const)('offers state for input-only channels in the %s editor', async (kind) => {
    const { service } = createService();
    const originalSnapshot = revision.snapshot;
    revision.snapshot = JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['input'] }] });
    try {
      await service.refresh();

      const schema = await service.resolveConfigSchema({ controllerId: 1, channelId: 'door', category: 'state' }, kind);

      expect((schema.properties as Record<string, { oneOf: Array<{ const: string }> }>).category.oneOf).toEqual([
        { const: 'state', title: 'state' },
        ...(kind === 'event' ? [{ const: 'fault', title: 'fault' }] : []),
      ]);
      if (kind === 'wait') expect(schema).toMatchObject({ properties: { equals: { type: 'boolean' } } });
    } finally {
      revision.snapshot = originalSnapshot;
    }
  });

  describe('wait freshness', () => {
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: true, timeoutMs: 1_000 };
    const stateMessage = (
      service: WagoFlowService,
      sequence: number,
      options: { age?: number; connected?: boolean; outputs?: Record<string, boolean> } = {},
    ) =>
      service['onMessage'](
        2,
        'attraccess/wago',
        'attraccess/wago/v1/controllers/cc100-01/state',
        Buffer.from(
          JSON.stringify({
            sequence,
            timestamp: new Date(Date.now() - (options.age ?? 0)).toISOString(),
            connected: options.connected ?? true,
            revision: 1,
            contentHash: 'hash',
            outputs: options.outputs ?? { door: true },
          }),
        ),
      );

    it.each([
      ['stale', { age: 90_001 }],
      ['offline', { connected: false }],
    ] as const)('does not complete from a %s cached match', async (_name, options) => {
      const { service } = createService();
      await service.refresh();
      await stateMessage(service, 1, options);
      const cached = service.read(config);
      expect(cached).toMatchObject({ value: true });
      expect(cached && service.payload(cached)).toMatchObject({ available: false });
      const waiting = service.wait(config);
      expect(service['waiters'].size).toBe(1);
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(waiting).resolves.toBeNull();
      expect(service['waitersByKey'].size).toBe(0);
    });

    it('completes immediately from a fresh retained match', async () => {
      const { service } = createService();
      await service.refresh();
      await stateMessage(service, 1);
      await expect(service.wait(config)).resolves.toMatchObject({ value: true });
      expect(service['waiters'].size).toBe(0);
    });

    it('does not let future-dated samples block fresh updates after clock correction', async () => {
      const { service } = createService();
      await service.refresh();
      const waiting = service.wait(config);
      await stateMessage(service, 10, { age: -60_000 });
      expect(service.read(config)).toBeNull();
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 11, { connected: false });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 12);
      await expect(waiting).resolves.toMatchObject({ value: true, sequence: 12, offline: false });
    });

    it('keeps a pending wait through stale and replayed matches until fresh reconnect state', async () => {
      const { service } = createService();
      await service.refresh();
      const waiting = service.wait(config);
      await stateMessage(service, 10, { age: 90_001 });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 10, { age: 90_001 });
      await stateMessage(service, 11, { age: 90_002 });
      expect(service.read(config)).toMatchObject({ sequence: 10 });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 1);
      await expect(waiting).resolves.toMatchObject({ sequence: 1, value: true });
    });

    it('does not revive cached values when disconnect and reconnect omit the channel', async () => {
      const { service } = createService();
      await service.refresh();
      await stateMessage(service, 1);
      await stateMessage(service, 2, { connected: false, outputs: {} });
      const cached = service.read(config);
      expect(cached && service.payload(cached)).toMatchObject({ stale: false, offline: true, available: false });
      const waiting = service.wait(config);
      await stateMessage(service, 3, { connected: false });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 4, { outputs: {} });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 5);
      await expect(waiting).resolves.toMatchObject({ value: true, sequence: 5, offline: false });
    });

    it('ages a previously fresh value using source time, without erasing readable state', async () => {
      const { service } = createService();
      await service.refresh();
      await stateMessage(service, 1);
      await jest.advanceTimersByTimeAsync(90_001);
      const cached = service.read(config);
      expect(cached && service.payload(cached)).toMatchObject({ value: true, stale: true, available: false });
      const waiting = service.wait(config);
      service.onModuleDestroy();
      await expect(waiting).resolves.toBeNull();
    });

    it('keeps measurement waits unavailable across interleaved offline telemetry until a new connected sample', async () => {
      const { service } = createService();
      await service.refresh();
      const measurementConfig = { ...config, category: 'measurement', equals: 42 };
      const measurement = (sequence: number) =>
        service['onMessage'](
          2,
          'attraccess/wago',
          'attraccess/wago/v1/controllers/cc100-01/measurements',
          Buffer.from(
            JSON.stringify({
              sequence,
              timestamp: new Date().toISOString(),
              channelId: 'door',
              unit: 'watt',
              value: 42,
            }),
          ),
        );
      await measurement(1);
      await stateMessage(service, 2, { connected: false, outputs: {} });
      const waiting = service.wait(measurementConfig);
      await measurement(3);
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 4, { outputs: {} });
      const cached = service.read(measurementConfig);
      expect(cached && service.payload(cached)).toMatchObject({ value: 42, offline: true, available: false });
      await measurement(5);
      await expect(waiting).resolves.toMatchObject({ value: 42, sequence: 5, offline: false });
    });

    it('bounds cache and queued dispatches while still resolving waits under backpressure', async () => {
      const { service, trigger, revisionQuery } = createService();
      const logicalChannels = Array.from({ length: 2_001 }, (_, index) => ({
        id: `channel-${index}`,
        capabilities: ['output'],
      }));
      revisionQuery.getMany.mockResolvedValue([{ ...revision, snapshot: JSON.stringify({ logicalChannels }) }]);
      let releaseDispatch: () => void;
      trigger.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseDispatch = resolve;
          }),
      );
      await service.refresh();
      const waiting = service.wait({ ...config, channelId: 'channel-2000' });
      await stateMessage(service, 1, { outputs: Object.fromEntries(logicalChannels.map(({ id }) => [id, true])) });
      await expect(waiting).resolves.toMatchObject({ channelId: 'channel-2000', value: true });
      expect(service['cache'].size).toBe(2_000);
      expect(service['dispatches'].length).toBe(100);
      expect(trigger).toHaveBeenCalledTimes(1);
      releaseDispatch();
      await jest.advanceTimersByTimeAsync(0);
      expect(service['dispatches'].length).toBe(0);
    });
  });

  it('applies minimum intervals from the last dispatch for each trigger node', () => {
    const { service } = createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', minimumIntervalMs: 75 };
    const state = (receivedAt: number) =>
      ({
        controllerId: 1,
        hardwareId: 'cc100-01',
        channelId: 'door',
        category: 'state',
        value: true,
        timestamp: '2026-08-30T00:00:00.000Z',
        sequence: receivedAt,
        receivedAt,
      }) as const;

    expect(service['matchesEvent'](config, 'node-1', state(0))).toBe(true);
    expect(service['matchesEvent'](config, 'node-1', state(50))).toBe(false);
    expect(service['matchesEvent'](config, 'node-1', state(100))).toBe(true);
    expect(service['matchesEvent'](config, 'node-2', state(50))).toBe(true);
  });
});
