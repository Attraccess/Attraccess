import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoController } from './wago-controller.entity';
import { WagoFlowService } from './wago-flow.service';
import { WagoSettings } from './wago-settings.entity';
import { parseOperationalMessage } from './protocol';
import { encodeMeasurement } from '../measurement-contract';

const STREAM_A = '11111111-1111-4111-8111-111111111111';
const STREAM_B = '22222222-2222-4222-8222-222222222222';

describe('WagoFlowService', () => {
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

  describe('wait freshness', () => {
    const config = { controllerId: 1, channelId: 'door', category: 'state', equals: true, timeoutMs: 1_000 };
    const stateMessage = (
      service: WagoFlowService,
      sequence: number,
      options: { age?: number; connected?: boolean; outputs?: Record<string, boolean>; streamId?: string } = {},
    ) =>
      service['onMessage'](
        2,
        'attraccess/wago',
        'attraccess/wago/v1/controllers/cc100-01/state',
        Buffer.from(
          JSON.stringify({
            streamId: options.streamId ?? STREAM_A,
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
      expect(service.read(config)).toMatchObject({ sequence: 11 });
      expect(service['waiters'].size).toBe(1);
      await stateMessage(service, 1, { streamId: STREAM_B });
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
      const { service, revisionQuery } = createService();
      revisionQuery.getMany.mockResolvedValue([
        { ...revision, snapshot: JSON.stringify({ logicalChannels: [{ id: 'door', capabilities: ['measurement'] }] }) },
      ]);
      await service.refresh();
      const measurementConfig = { ...config, category: 'measurement', equals: 42 };
      const measurement = (sequence: number) =>
        service['onMessage'](
          2,
          'attraccess/wago',
          'attraccess/wago/v1/controllers/cc100-01/measurements',
          Buffer.from(
            JSON.stringify({
              streamId: STREAM_A,
              sequence,
              timestamp: new Date().toISOString(),
              channelId: 'door',
              unit: 'milliwatt',
              kind: 'live',
              value: 42,
            }),
          ),
        );
      await stateMessage(service, 1, { outputs: {} });
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

  describe('canonical parser/consumer contract', () => {
    const config = { controllerId: 1, channelId: 'sensor', category: 'state', equals: true, timeoutMs: 1_000 };
    const channels = [
      { id: 'sensor', capabilities: ['input'] },
      { id: 'relay', capabilities: ['output'] },
      { id: 'power', capabilities: ['measurement'] },
    ];
    async function setup() {
      const fixture = createService();
      fixture.revisionQuery.getMany.mockResolvedValue([
        { ...revision, snapshot: JSON.stringify({ logicalChannels: channels }) },
      ]);
      await fixture.service.refresh();
      return fixture;
    }
    const send = (
      service: WagoFlowService,
      suffix: string,
      sequence: number,
      body: Record<string, unknown>,
      streamId = STREAM_A,
    ) =>
      service['onMessage'](
        2,
        'attraccess/wago',
        `attraccess/wago/v1/controllers/cc100-01/${suffix}`,
        Buffer.from(JSON.stringify({ timestamp: new Date().toISOString(), streamId, sequence, ...body })),
      );
    const snapshot = (
      service: WagoFlowService,
      sequence: number,
      body: Record<string, unknown> = {},
      streamId = STREAM_A,
    ) =>
      send(
        service,
        'state',
        sequence,
        { connected: true, revision: 1, contentHash: 'hash', outputs: {}, inputs: {}, ...body },
        streamId,
      );
    const measurement = { channelId: 'power', unit: 'milliwatt', kind: 'live', value: 500 };

    it('ingests input-only state through the real parser and dispatches typed input events', async () => {
      const { service, trigger } = await setup();
      const waiting = service.wait(config);
      await snapshot(service, 1, { inputs: { sensor: true } });
      await expect(waiting).resolves.toMatchObject({ value: true, streamId: STREAM_A });
      const cached = service.read(config);
      expect(cached && service.payload(cached)).toMatchObject({
        value: true,
        available: true,
        stale: false,
        streamId: STREAM_A,
      });
      expect(trigger).toHaveBeenCalledWith('plugin.wago.event-received', expect.any(Function), {
        wago: expect.objectContaining({ channelId: 'sensor', value: true }),
      });
      expect(trigger.mock.calls[0][1](config, 'input-node')).toBe(true);
    });

    it.each([{ inputs: {} }, { inputs: undefined }])(
      'invalidates omitted inputs in a newer complete snapshot: %j',
      async (missing) => {
        const { service } = await setup();
        await snapshot(service, 1, { inputs: { sensor: true } });
        await snapshot(service, 2, missing);
        const cached = service.read(config);
        expect(cached && service.payload(cached)).toMatchObject({ value: true, available: false });
        const waiting = service.wait(config);
        await snapshot(service, 1, { inputs: { sensor: true } });
        expect(service['waiters'].size).toBe(1);
        await jest.advanceTimersByTimeAsync(1_000);
        await expect(waiting).resolves.toBeNull();
        await snapshot(service, 3, { inputs: { sensor: true } });
        await expect(service.wait(config)).resolves.toMatchObject({ sequence: 3 });
      },
    );

    it('rejects values from maps or categories unsupported by the channel capability', async () => {
      const { service, trigger } = await setup();
      await snapshot(service, 1, { outputs: { sensor: true, power: true }, inputs: { relay: true } });
      await send(service, 'measurements', 1, { ...measurement, channelId: 'sensor' });
      expect(service.read(config)).toBeNull();
      expect(service.read({ ...config, channelId: 'relay' })).toBeNull();
      expect(service.read({ ...config, channelId: 'power' })).toBeNull();
      expect(trigger).not.toHaveBeenCalled();
    });

    it('keeps input and measurement samples unavailable after hardware loss until new samples arrive', async () => {
      const { service } = await setup();
      const meter = { ...config, channelId: 'power', category: 'measurement', equals: 500 };
      await snapshot(service, 1, { inputs: { sensor: true } });
      await send(service, 'measurements', 1, measurement);
      await snapshot(service, 2, {
        inputs: { sensor: true },
        readiness: { configurationAccepted: true, hardwareAvailable: false, ready: false, errors: [] },
      });
      const waitingInput = service.wait(config);
      const waitingMeter = service.wait(meter);
      await send(service, 'measurements', 2, measurement);
      expect(service['waiters'].size).toBe(2);
      await snapshot(service, 3, {
        readiness: { configurationAccepted: true, hardwareAvailable: true, ready: true, errors: [] },
      });
      expect(service['waiters'].size).toBe(2);
      await snapshot(service, 4, { inputs: { sensor: true } });
      await send(service, 'measurements', 3, measurement);
      await expect(waitingInput).resolves.toMatchObject({ value: true, sequence: 4 });
      await expect(waitingMeter).resolves.toMatchObject({ value: 500, sequence: 3 });
    });

    it('preserves source metadata and independent category counters across interleaving and boot restart', async () => {
      const { service } = await setup();
      const meter = { ...config, channelId: 'power', category: 'measurement', equals: 500 };
      await snapshot(service, 50, { inputs: { sensor: false } });
      await send(service, 'measurements', 1, measurement);
      await send(service, 'faults', 1, { channelId: 'sensor', code: 'fault', message: 'test fault' });
      await send(service, 'acknowledgements', 1, { id: 'command', status: 'accepted' });
      await snapshot(service, 51, { inputs: { sensor: true } });
      const measured = service.read(meter);
      expect(measured && service.payload(measured)).toMatchObject({
        ...measurement,
        timestamp: new Date().toISOString(),
        streamId: STREAM_A,
        sequence: 1,
        available: true,
      });
      await send(service, 'measurements', 1, { ...measurement, value: 999 });
      expect(service.read(meter)).toMatchObject({ value: 500 });
      // Wall-clock advancement cannot reset a counter in the same boot.
      await jest.advanceTimersByTimeAsync(10);
      await snapshot(service, 1, { inputs: { sensor: false } });
      expect(service.read(config)).toMatchObject({ value: true, sequence: 51 });
      await snapshot(service, 1, { inputs: { sensor: false } }, STREAM_B);
      const waiting = service.wait(meter);
      await send(service, 'measurements', 100, { ...measurement, value: 500 }, STREAM_A);
      await snapshot(service, 100, { inputs: { sensor: true } }, STREAM_A);
      expect(service['waiters'].size).toBe(1);
      expect(service.read(config)).toMatchObject({ value: false, streamId: STREAM_B });
      await send(service, 'measurements', 1, measurement, STREAM_B);
      await expect(waiting).resolves.toMatchObject({
        unit: 'milliwatt',
        kind: 'live',
        streamId: STREAM_B,
        sequence: 1,
      });
    });

    it('requires a state snapshot to establish an unseen boot before accepting telemetry', async () => {
      const { service } = await setup();
      await send(service, 'measurements', 1, measurement);
      expect(service.read({ ...config, channelId: 'power', category: 'measurement' })).toBeNull();
      await snapshot(service, 1);
      await send(service, 'measurements', 2, measurement, STREAM_B);
      expect(service['streams'].get(1)?.active).toBe(STREAM_A);
    });

    it.each([0, 1])(
      'rejects an unseen old boot with source age %i without guessing resets from the clock',
      async (age) => {
        const { service } = await setup();
        await snapshot(service, 1, { inputs: { sensor: false } });
        await snapshot(
          service,
          1,
          { timestamp: new Date(Date.now() - age).toISOString(), inputs: { sensor: true } },
          STREAM_B,
        );
        expect(service.read(config)).toMatchObject({ value: false, streamId: STREAM_A });
        expect(service['streams'].get(1)?.retired.size).toBe(0);
      },
    );

    it('invalidates samples when the applied physical mapping changes and requires its reported revision/hash', async () => {
      const { service, revisionQuery } = await setup();
      await snapshot(service, 1, { inputs: { sensor: true } });
      revisionQuery.getMany.mockResolvedValue([
        { ...revision, revision: 2, contentHash: 'new-hash', snapshot: JSON.stringify({ logicalChannels: channels }) },
      ]);
      await service.refresh();
      const waiting = service.wait(config);
      await snapshot(service, 2, { inputs: { sensor: true } });
      expect(service['waiters'].size).toBe(1);
      await snapshot(service, 3, { revision: 2, contentHash: 'wrong-hash', inputs: { sensor: true } });
      expect(service['waiters'].size).toBe(1);
      const cached = service.read(config);
      expect(cached && service.payload(cached)).toMatchObject({
        revision: 2,
        contentHash: 'wrong-hash',
        available: false,
      });
      await snapshot(service, 4, { revision: 2, contentHash: 'new-hash', inputs: { sensor: true } });
      await expect(waiting).resolves.toMatchObject({ revision: 2, contentHash: 'new-hash', value: true });
    });

    it('fails closed at the retired-stream bound instead of forgetting replay protection', async () => {
      const { service } = await setup();
      await snapshot(service, 1);
      for (let index = 1; index <= 129; index++) {
        await jest.advanceTimersByTimeAsync(1);
        const streamId = `33333333-3333-4333-8333-${index.toString().padStart(12, '0')}`;
        await snapshot(service, 1, { inputs: { sensor: true } }, streamId);
      }
      expect(service['streams'].get(1)?.retired.size).toBe(128);
      expect(service['streams'].get(1)?.active).toBe('33333333-3333-4333-8333-000000000128');
      await snapshot(service, 999, { inputs: { sensor: false } }, STREAM_A);
      expect(service.read(config)).toMatchObject({ value: true });
      const cached = service.read(config);
      expect(cached && service.payload(cached)).toMatchObject({ available: false });
      await snapshot(service, 999, { inputs: { sensor: true } }, '33333333-3333-4333-8333-000000000128');
      const waiting = service.wait(config);
      await jest.advanceTimersByTimeAsync(1_000);
      await expect(waiting).resolves.toBeNull();
    });

    it('does not revive pre-disconnect measurements delivered after recovery', async () => {
      const { service } = await setup();
      await snapshot(service, 1);
      const oldSourceTime = new Date().toISOString();
      await jest.advanceTimersByTimeAsync(10);
      await snapshot(service, 2, { connected: false });
      await jest.advanceTimersByTimeAsync(10);
      await snapshot(service, 3);
      const waiting = service.wait({ ...config, channelId: 'power', category: 'measurement', equals: 500 });
      await send(service, 'measurements', 1, { ...measurement, timestamp: oldSourceTime });
      expect(service['waiters'].size).toBe(1);
      await send(service, 'measurements', 2, measurement);
      await expect(waiting).resolves.toMatchObject({ value: 500, sequence: 2 });
    });

    it('requires fresh connected-state evidence even when measurement samples are fresh', async () => {
      const { service } = await setup();
      await snapshot(service, 1, { timestamp: new Date(Date.now() - 90_001).toISOString() });
      await send(service, 'measurements', 1, measurement);
      const meter = { ...config, channelId: 'power', category: 'measurement', equals: 500 };
      const cached = service.read(meter);
      expect(cached && service.payload(cached)).toMatchObject({
        stale: false,
        connectionStale: true,
        available: false,
      });
      const waiting = service.wait(meter);
      await jest.advanceTimersByTimeAsync(1);
      await snapshot(service, 2);
      expect(cached && service.payload(cached)).toMatchObject({ connectionStale: false, available: false });
      const waitingAfterRecovery = service.wait(meter);
      expect(service['waiters'].size).toBe(2);
      await send(service, 'measurements', 2, measurement);
      await expect(waiting).resolves.toMatchObject({ value: 500, sequence: 2 });
      await expect(waitingAfterRecovery).resolves.toMatchObject({ value: 500, sequence: 2 });
    });

    it('drops queued events from a retired boot while keeping the dispatch queue bounded', async () => {
      const { service, trigger } = await setup();
      let release: () => void;
      trigger.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      await snapshot(service, 1, { inputs: { sensor: false } });
      await snapshot(service, 2, { inputs: { sensor: true } });
      await jest.advanceTimersByTimeAsync(1);
      await snapshot(service, 1, { inputs: { sensor: false } }, STREAM_B);
      release();
      await jest.advanceTimersByTimeAsync(0);
      expect(trigger).toHaveBeenCalledTimes(2);
      expect(trigger.mock.calls[1][2]).toMatchObject({ wago: { streamId: STREAM_B, value: false } });
      expect(service['dispatches']).toHaveLength(0);
    });

    it.each([
      { kind: 'live', unit: 'milliampere', value: 500 },
      { kind: 'live', unit: 'millivolt', value: 230_500 },
      { kind: 'cumulative', unit: 'milliwatt-hour', value: 1_234_000 },
    ])('preserves canonical measurement units without scaling twice: %j', async (sample) => {
      const { service } = await setup();
      await snapshot(service, 1);
      const wire = {
        timestamp: new Date().toISOString(),
        streamId: STREAM_A,
        sequence: 1,
        channelId: 'power',
        ...sample,
      };
      expect(
        parseOperationalMessage(
          'attraccess/wago',
          'attraccess/wago/v1/controllers/cc100-01/measurements',
          Buffer.from(JSON.stringify(wire)),
        )?.message,
      ).toMatchObject(wire);
      await send(service, 'measurements', 1, wire);
      const cached = service.read({ ...config, channelId: 'power', category: 'measurement' });
      expect(cached && service.payload(cached)).toMatchObject({ ...wire, available: true });
    });

    it.each([{ sequence: 0 }, { value: 0.5 }, { unit: 'kilowatt' }, { kind: 'unknown' }])(
      'rejects malformed operational measurement envelopes through the parser: %j',
      async (invalid) => {
        const { service } = await setup();
        await snapshot(service, 1);
        await send(service, 'measurements', 1, { ...measurement, ...invalid });
        expect(service.read({ ...config, channelId: 'power', category: 'measurement' })).toBeNull();
      },
    );

    it('compares owner-defined opaque stream identities without assuming UUID syntax', async () => {
      const { service } = await setup();
      await snapshot(service, 1, { inputs: { sensor: false } }, 'boot-a');
      expect(service.read(config)).toMatchObject({ streamId: 'boot-a', value: false });
      await jest.advanceTimersByTimeAsync(1);
      await snapshot(service, 1, { inputs: { sensor: true } }, 'boot-b');
      await snapshot(service, 2, { inputs: { sensor: false } }, 'boot-a');
      expect(service.read(config)).toMatchObject({ streamId: 'boot-b', value: true });
      expect(service['streams'].get(1)?.retired.size).toBe(1);
    });

    it.each([
      { raw: 0.5, unit: 'ampere', expectedUnit: 'milliampere', expectedValue: 500 },
      { raw: 230.5, unit: 'volt', expectedUnit: 'millivolt', expectedValue: 230_500 },
      { raw: 42, unit: 'percent', expectedUnit: 'millipercent', expectedValue: 42_000 },
      {
        raw: Number.MAX_SAFE_INTEGER,
        unit: 'watt-hour',
        expectedUnit: 'watt-hour',
        expectedValue: Number.MAX_SAFE_INTEGER,
      },
    ])(
      'consumes the committed encoder output through the parser without rescaling: %j',
      async ({ raw, unit, expectedUnit, expectedValue }) => {
        const { service } = await setup();
        await snapshot(service, 1);
        const encoded = encodeMeasurement('power', raw, { unit, scale: 1, offset: 0, kind: 'live' });
        await send(service, 'measurements', 1, encoded);
        const cached = service.read({ ...config, channelId: 'power', category: 'measurement' });
        expect(cached && service.payload(cached)).toMatchObject({
          unit: expectedUnit,
          value: expectedValue,
          kind: 'live',
          available: true,
        });
      },
    );
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
