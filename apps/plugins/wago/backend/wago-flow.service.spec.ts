import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import plugin from './plugin';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoFlowService } from './wago-flow.service';
import { STREAM_A, STREAM_B } from './wago-flow.state';
import { WagoSettings } from './wago-settings.entity';

describe('WagoFlowService schemas and dispatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-05T12:00:00.000Z'));
  });

  afterEach(() => jest.useRealTimers());

  const controller = { id: 1, hardwareId: 'cc100-01', trustState: 'claimed', mqttServerId: null } as WagoController;

  const revision = {
    controllerId: 1,
    revision: 1,
    contentHash: 'hash',
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
    return {
      service: new WagoFlowService(context),
      trigger,
      context,
      revisionQuery,
      revisionRepository,
      controllerRepository,
    };
  }

  it('isolates filtered preview controller lookups in a shared context', async () => {
    const { service, controllerRepository } = createService();
    controllerRepository.find.mockImplementation(async ({ where }: { where: { id: number } }) => [
      { ...controller, id: where.id, hardwareId: `controller-${where.id}` },
    ]);
    const context = new Map<string, unknown>();
    const first = await service.resolveConfigSchema(
      { controllerId: 1, channelId: 'door', category: 'state' },
      'read',
      context,
      true,
    );
    const second = await service.resolveConfigSchema(
      { controllerId: 2, channelId: 'door', category: 'state' },
      'read',
      context,
      true,
    );
    expect(first.preview).toMatchObject([
      { label: 'Device', value: 'controller-1' },
      { label: 'Channel', value: 'door' },
      { label: 'Read', value: 'Output state' },
    ]);
    expect(second.preview).toMatchObject([
      { label: 'Device', value: 'controller-2' },
      { label: 'Channel', value: 'door' },
      { label: 'Read', value: 'Output state' },
    ]);
    expect(controllerRepository.find).toHaveBeenCalledTimes(2);
    await service.resolveConfigSchema({ controllerId: 1, channelId: 'door' }, 'read', context, true);
    expect(controllerRepository.find).toHaveBeenCalledTimes(2);
  });

  it('starts with an unavailable MQTT broker and retries flow subscriptions', async () => {
    const { service, context } = createService();
    const subscribe = context.mqtt.subscribe as jest.Mock;
    subscribe.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    expect(context.logger.warn).toHaveBeenCalledWith(expect.stringContaining('broker unavailable'));

    await jest.advanceTimersByTimeAsync(60_000);
    expect(subscribe).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
  });

  it('still fails startup when flow settings cannot be read', async () => {
    const { service, context } = createService();
    const settings = context.getRepository(WagoSettings) as unknown as { findOneBy: jest.Mock };
    settings.findOneBy.mockRejectedValueOnce(new Error('settings unavailable'));

    await expect(service.onModuleInit()).rejects.toThrow('settings unavailable');
  });

  it('rejects an invalid operational prefix before attempting MQTT subscriptions', async () => {
    const { service, context } = createService();
    const settings = context.getRepository(WagoSettings) as unknown as { findOneBy: jest.Mock };
    settings.findOneBy.mockResolvedValueOnce({ id: 1, defaultMqttServerId: 2, operationalPrefix: 'bad/#' });

    await expect(service.onModuleInit()).rejects.toThrow();
    expect(context.mqtt.subscribe).not.toHaveBeenCalled();
  });

  it('registers the plugin before the host datasource is available', () => {
    const { context } = createService();
    const getRepository = jest.spyOn(context, 'getRepository').mockImplementation(() => {
      throw new Error('Host DataSource is not available yet');
    });
    getRepository.mockClear();
    expect(() => plugin.register(context)).not.toThrow();
    expect(getRepository).not.toHaveBeenCalled();
  });

  it.each(['event', 'read', 'wait'] as const)('validates applied channels for %s nodes', async (kind) => {
    const { service } = createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: false };
    await expect(service.validateConfig(config, kind)).resolves.toEqual([]);
    await expect(service.validateConfig({ ...config, channelId: 'removed' }, kind)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'channelId' })]),
    );
    await expect(service.validateConfig({ ...config, category: 'measurement' }, kind)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'category' })]),
    );
  });

  it.each(['event', 'read', 'wait'] as const)('provides a concise %s preview for the selected output', async (kind) => {
    const { service } = createService();
    const schema = await service.resolveConfigSchema(
      {
        controllerId: 1,
        channelId: 'door',
        category: 'state',
        equals: false,
        timeoutMs: 1500,
      },
      kind,
    );
    expect(schema.preview).toMatchObject([
      { label: 'Device', value: 'cc100-01' },
      { label: 'Channel', value: 'door' },
      ...(kind === 'event'
        ? [{ label: 'When', value: 'Output state received' }]
        : kind === 'read'
          ? [{ label: 'Read', value: 'Output state' }]
          : [
              { label: 'Wait for', value: 'Output state = OFF' },
              { label: 'Timeout', value: '1.5 s' },
            ]),
    ]);
  });

  it('identifies an external meter and keeps a zero-valued wait condition visible', async () => {
    const { service, revisionRepository } = createService();
    revisionRepository.find.mockResolvedValue([
      {
        ...revision,
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'power', physicalPointId: 'meter-point', capabilities: ['measurement'] }],
          physicalPoints: [{ id: 'meter-point', hardwareProfile: 'modbus', modbus: { deviceId: 'meter' } }],
          modbus: { devices: [{ id: 'meter', name: 'WAGO 879-3000' }] },
        }),
        presetProvenance: JSON.stringify({ editor: { names: { power: 'Active power' } } }),
      },
    ]);
    const schema = await service.resolveConfigSchema(
      {
        controllerId: 1,
        channelId: 'power',
        category: 'measurement',
        equals: 0,
        timeoutMs: 30_000,
      },
      'wait',
    );
    expect(schema.preview).toMatchObject([
      { label: 'Device', value: 'cc100-01' },
      { label: 'Channel', value: 'Active power · WAGO 879-3000' },
      { label: 'Wait for', value: 'Measurement = 0 (wire value)' },
      { label: 'Timeout', value: '30 s' },
    ]);
  });

  it('uses current applied channel names in the form even when the runtime cache is populated', async () => {
    const { service, revisionRepository } = createService();
    await service.refresh();
    revisionRepository.find.mockResolvedValue([
      {
        ...revision,
        snapshot: JSON.stringify({ logicalChannels: [{ id: 'new-input', capabilities: ['input'] }] }),
        presetProvenance: JSON.stringify({ editor: { names: { 'new-input': 'Door contact' } } }),
      },
    ]);
    await expect(
      service.resolveConfigSchema({ controllerId: 1, channelId: 'new-input' }, 'event'),
    ).resolves.toMatchObject({
      properties: { channelId: { oneOf: [{ const: 'new-input', title: 'Door contact' }] } },
    });
  });

  it('rejects invalid wait conditions and event filters', async () => {
    const { service } = createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state' };
    await expect(service.validateConfig({ ...config, equals: 'true', timeoutMs: 0 }, 'wait')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'equals' }),
        expect.objectContaining({ field: 'timeoutMs' }),
      ]),
    );
    await expect(
      service.validateConfig({ ...config, minimumIntervalMs: -1, minimumChange: NaN }, 'event'),
    ).resolves.toHaveLength(2);
  });

  it('shares applied configuration lookups while validating a flow', async () => {
    const { service, revisionRepository } = createService();
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: false };
    const context = new Map<string, unknown>();
    await Promise.all([
      service.validateConfig(config, 'event', context),
      service.validateConfig(config, 'read', context),
      service.validateConfig(config, 'wait', context),
    ]);
    expect(revisionRepository.find).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent controller messages before asynchronous channel resolution', async () => {
    const { service } = createService();
    await service.refresh();
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const channels = jest
      .spyOn(
        service as unknown as { channels(id: number): Promise<Array<{ id: string; capabilities: string[] }>> },
        'channels',
      )
      .mockImplementationOnce(async () => {
        await held;
        return [{ id: 'door', capabilities: ['output'] }];
      });
    const topic = 'attraccess/wago/v1/controllers/cc100-01/state';
    const event = (sequence: number) =>
      Buffer.from(
        JSON.stringify({
          streamId: STREAM_A,
          sequence,
          timestamp: new Date().toISOString(),
          connected: true,
          revision: 1,
          contentHash: 'hash',
          outputs: { door: sequence === 2 },
        }),
      );
    const first = service['onMessage'](2, 'attraccess/wago', topic, event(1));
    const second = service['onMessage'](2, 'attraccess/wago', topic, event(2));
    await Promise.resolve();
    await Promise.resolve();
    expect(channels).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(service.read({ controllerId: 1, channelId: 'door' })).toMatchObject({ sequence: 2, value: true });
  });

  it('caches a validated retained state and dispatches matching trigger nodes', async () => {
    const { service, trigger, context } = createService();
    await service.refresh();
    await service['onMessage'](
      2,
      'attraccess/wago',
      'attraccess/wago/v1/controllers/cc100-01/state',
      Buffer.from(
        JSON.stringify({
          streamId: STREAM_A,
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
          streamId: STREAM_A,
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
          streamId: STREAM_A,
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
          streamId: STREAM_A,
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
    const event = (sequence: number, timestamp: string, value: boolean, streamId = STREAM_A) =>
      Buffer.from(
        JSON.stringify({
          streamId,
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
    await service['onMessage'](2, 'attraccess/wago', topic, event(1, new Date().toISOString(), true, STREAM_B));
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
          streamId: STREAM_A,
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

  it('resets minimum-change comparisons when units, kinds or boot streams change', () => {
    const { service } = createService();
    const config = { controllerId: 1, channelId: 'power', category: 'measurement', minimumChange: 10 };
    const previous = {
      controllerId: 1,
      hardwareId: 'cc100-01',
      channelId: 'power',
      category: 'measurement',
      value: 500,
      unit: 'milliampere',
      kind: 'live',
      timestamp: '2026-08-30T00:00:00.000Z',
      sequence: 1,
      streamId: STREAM_A,
      receivedAt: 0,
    } as const;

    expect(service['matchesEvent'](config, 'node', { ...previous, value: 505 }, previous)).toBe(false);
    expect(service['matchesEvent'](config, 'node', { ...previous, value: 520 }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, unit: 'ampere' }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, kind: 'cumulative' }, previous)).toBe(true);
    expect(service['matchesEvent'](config, 'node', { ...previous, streamId: STREAM_B }, previous)).toBe(true);
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
        streamId: STREAM_A,
        receivedAt,
      }) as const;

    expect(service['matchesEvent'](config, 'node-1', state(0))).toBe(true);
    expect(service['matchesEvent'](config, 'node-1', state(50))).toBe(false);
    expect(service['matchesEvent'](config, 'node-1', state(100))).toBe(true);
    expect(service['matchesEvent'](config, 'node-2', state(50))).toBe(true);
  });
});
