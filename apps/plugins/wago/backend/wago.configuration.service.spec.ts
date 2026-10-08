import { configurationHash } from './configuration';
import { WagoEnrollment } from './wago-enrollment.entity';
import { controller, createWagoServiceFixture } from './wago-service.test-fixture';
import { WagoService } from './wago.service';

describe('WagoService configuration and commands', () => {
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

  it.each(['pending', 'rejected', 'published', 'applied'])(
    'replays only published configuration when the latest revision is %s',
    async (state) => {
      const { service, context, revisionRepository } = createService([{ ...controller(), trustState: 'claimed' }]);
      revisionRepository.find.mockResolvedValue([{ revision: 1, state, snapshot: '{}' }]);
      const image = `sha256:${'a'.repeat(64)}`;
      await service.setRuntimePolicy(1, image, image, 'boot-token');
      expect(context.mqtt.publish).toHaveBeenCalledTimes(['published', 'applied'].includes(state) ? 2 : 1);
    },
  );

  it('publishes a configured command without waiting when dispatch completion is selected', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = createService([claimed], [], 2);
    revisionRepository.find.mockResolvedValue([
      {
        controllerId: claimed.id,
        revision: 3,
        state: 'applied',
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'pump', capabilities: ['output'] }],
        }),
      },
    ]);

    await expect(
      service.executeCommand({
        controllerId: claimed.id,
        channelId: 'pump',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 3,
        completionBehavior: 'dispatch',
      }),
    ).resolves.toBeUndefined();

    expect(context.mqtt.publish).toHaveBeenCalledWith(
      claimed.mqttServerId,
      'attraccess/wago/v1/controllers/cc100-01/commands',
      expect.stringMatching(/"channelId":"pump"/),
      { qos: 1, retain: false },
    );
  });

  it('rejects invalid persisted command policies', async () => {
    const { service } = createService();

    await expect(
      service.validateCommandConfig({
        controllerId: 1,
        channelId: 'pump',
        action: 'pulse',
        expectedConfigurationRevision: 1,
        completionBehavior: 'later',
        failureBehavior: 'ignore-everything',
      }),
    ).resolves.toEqual([
      expect.objectContaining({ field: 'completionBehavior' }),
      expect.objectContaining({ field: 'failureBehavior' }),
    ]);
  });

  it('rejects acknowledgement timeouts that exceed the supported maximum', async () => {
    const { service } = createService();

    await expect(
      service.validateCommandConfig({
        controllerId: 1,
        channelId: 'pump',
        action: 'pulse',
        expectedConfigurationRevision: 1,
        acknowledgementTimeoutSeconds: Number.MAX_SAFE_INTEGER,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        field: 'acknowledgementTimeoutSeconds',
        message: 'Acknowledgement timeout must not exceed 300 seconds.',
      }),
    ]);
  });

  it('binds numeric controller IDs when looking up channel references', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = createService([claimed]);
    revisionRepository.find.mockResolvedValue([
      {
        controllerId: claimed.id,
        revision: 3,
        state: 'applied',
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'pump', profile: 'generic-digital-output', capabilities: ['output'] }],
        }),
      },
    ]);
    const query = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    Object.assign(context, {
      dataSource: {
        getRepository: jest.fn().mockReturnValue({ createQueryBuilder: jest.fn().mockReturnValue(query) }),
      },
    });

    await service.commandSchema({ controllerId: claimed.id, channelId: 'pump' }, 2);

    expect(query.andWhere).toHaveBeenCalledWith("node.data ->> 'controllerId' = :controllerId", {
      controllerId: claimed.id,
    });
  });

  it('consumes a pending acknowledgement rejection when command publication fails', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = createService([claimed], [], 2);
    revisionRepository.find.mockResolvedValue([
      {
        controllerId: claimed.id,
        revision: 3,
        state: 'applied',
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'pump', capabilities: ['output', 'pulse'], pulse: { durationMs: 500 } }],
        }),
      },
    ]);
    (context.mqtt.publish as jest.Mock).mockRejectedValue(new Error('broker offline'));

    await expect(
      service.executeCommand({
        controllerId: claimed.id,
        channelId: 'pump',
        action: 'pulse',
        expectedConfigurationRevision: 3,
      }),
    ).rejects.toThrow('Failed to publish WAGO command: Error: broker offline');
  });

  it('propagates a controller acknowledgement rejection message', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = createService([claimed], [], 2);
    revisionRepository.find.mockResolvedValue([
      {
        controllerId: claimed.id,
        revision: 3,
        state: 'applied',
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'pump', capabilities: ['output', 'pulse'], pulse: { durationMs: 500 } }],
        }),
      },
    ]);
    (context.mqtt.publish as jest.Mock).mockImplementation(async () => {
      const command = JSON.parse((context.mqtt.publish as jest.Mock).mock.calls[0][2]) as { id: string };
      const acknowledge = Reflect.get(service, 'onCommandAcknowledgement') as (
        controllerId: number,
        payload: Buffer,
      ) => void;
      acknowledge.call(
        service,
        claimed.id,
        Buffer.from(JSON.stringify({ id: command.id, status: 'rejected', error: 'command expired' })),
      );
    });

    await expect(
      service.executeCommand({
        controllerId: claimed.id,
        channelId: 'pump',
        action: 'pulse',
        expectedConfigurationRevision: 3,
      }),
    ).rejects.toThrow('command expired');
  });

  it('ignores null acknowledgements and rejects while publication is stalled', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = createService([claimed], [], 2);
    revisionRepository.find.mockResolvedValue([
      {
        controllerId: claimed.id,
        revision: 3,
        state: 'applied',
        snapshot: JSON.stringify({
          logicalChannels: [{ id: 'pump', capabilities: ['output', 'pulse'], pulse: { durationMs: 500 } }],
        }),
      },
    ]);
    (context.mqtt.publish as jest.Mock).mockImplementation(() => {
      const command = JSON.parse((context.mqtt.publish as jest.Mock).mock.calls[0][2]) as { id: string };
      const acknowledge = Reflect.get(service, 'onCommandAcknowledgement') as (
        controllerId: number,
        payload: Buffer,
      ) => void;
      acknowledge.call(service, claimed.id, Buffer.from('null'));
      acknowledge.call(
        service,
        claimed.id,
        Buffer.from(JSON.stringify({ id: command.id, status: 'rejected', error: 'command expired' })),
      );
      return new Promise<void>(() => undefined);
    });

    await expect(
      service.executeCommand({
        controllerId: claimed.id,
        channelId: 'pump',
        action: 'pulse',
        expectedConfigurationRevision: 3,
      }),
    ).rejects.toThrow('command expired');
  });

  it('publishes a retained, content-addressed revision only after validation', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, draftRepository, revisionRepository, context } = createService([claimed]);
    let draft: { controllerId: number; snapshot: string; reviewedHash: string | null; updatedAt: string } | null = null;
    draftRepository.findOneBy.mockImplementation(async () => draft);
    draftRepository.save.mockImplementation(async (value) => {
      draft = value;
      return value;
    });

    await service.saveDraft(claimed.id, {
      version: 1,
      physicalPoints: [{ id: 'point-a', hardwareProfile: '751-9301', channel: 0 }],
      logicalChannels: [
        {
          id: 'channel-a',
          physicalPointId: 'point-a',
          profile: 'generic-digital-output',
          capabilities: ['output'],
          disconnectPolicy: { mode: 'hold' },
        },
      ],
    });
    await service.reviewDraft(claimed.id);
    const revision = await service.publishDraft(claimed.id);

    expect(revision).toMatchObject({
      revision: 1,
      state: 'published',
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(context.mqtt.publish).toHaveBeenCalledWith(
      2,
      'attraccess/wago/v1/controllers/cc100-01/configuration/desired',
      expect.stringContaining('"protocolVersion":1'),
      { qos: 1, retain: true },
    );
    expect(revisionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
  });

  it('rejects publication for a claimed runtime without the configuration contract', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, capabilities: '["claim","heartbeat"]' };
    const { service, draftRepository } = createService([claimed]);
    const snapshot = { version: 1, physicalPoints: [], logicalChannels: [] };
    draftRepository.findOneBy.mockResolvedValue({
      controllerId: claimed.id,
      reviewedHash: configurationHash({ snapshot: JSON.stringify(snapshot), metadata: null }),
      snapshot: JSON.stringify(snapshot),
    });

    await expect(service.publishDraft(claimed.id)).rejects.toThrow('configuration-v1');
  });

  it('records structured controller rejection without changing the published snapshot', async () => {
    const { service, revisionRepository } = createService([{ ...controller(), trustState: 'claimed' as const }]);
    const revision = {
      id: 1,
      controllerId: 1,
      revision: 2,
      snapshot: '{}',
      contentHash: 'a'.repeat(64),
      state: 'published' as const,
      rejectionErrors: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      reportedAt: null,
    };
    revisionRepository.findOneBy.mockResolvedValue(revision);
    const onConfigurationReported = (
      Reflect.get(service, 'onConfigurationReported') as (controllerId: number, payload: Buffer) => Promise<void>
    ).bind(service);

    await onConfigurationReported(
      1,
      Buffer.from(
        JSON.stringify({
          revision: 2,
          contentHash: revision.contentHash,
          errors: [{ path: 'logicalChannels[0]', code: 'unsupported_capability', message: 'unsupported capability' }],
        }),
      ),
    );

    expect(revisionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'rejected',
        rejectionErrors: expect.stringContaining('unsupported_capability'),
      }),
    );
  });

  it.each(['applied', 'rejected'] as const)('ignores reports for a terminal %s revision state', async (state) => {
    const { service, revisionRepository } = createService([{ ...controller(), trustState: 'claimed' as const }]);
    const revision = {
      id: 1,
      controllerId: 1,
      revision: 2,
      snapshot: '{}',
      contentHash: 'a'.repeat(64),
      state,
      rejectionErrors: state === 'rejected' ? '[]' : null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      reportedAt: '2026-01-01T00:01:00.000Z',
    };
    revisionRepository.findOneBy.mockResolvedValue(revision);
    const onConfigurationReported = (
      Reflect.get(service, 'onConfigurationReported') as (controllerId: number, payload: Buffer) => Promise<void>
    ).bind(service);

    await onConfigurationReported(
      1,
      Buffer.from(
        JSON.stringify({
          revision: revision.revision,
          contentHash: revision.contentHash,
          errors: state === 'applied' ? [{ path: 'logicalChannels[0]', code: 'invalid', message: 'invalid' }] : [],
        }),
      ),
    );

    expect(revisionRepository.save).not.toHaveBeenCalled();
  });

  it('ignores controller rejections without field-level error details', async () => {
    const { service, revisionRepository, context } = createService([
      { ...controller(), trustState: 'claimed' as const },
    ]);
    const onConfigurationReported = (
      Reflect.get(service, 'onConfigurationReported') as (controllerId: number, payload: Buffer) => Promise<void>
    ).bind(service);

    await onConfigurationReported(
      1,
      Buffer.from(JSON.stringify({ revision: 2, contentHash: 'a'.repeat(64), errors: [{ code: 'invalid' }] })),
    );

    expect(revisionRepository.save).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledWith('Ignoring malformed WAGO configuration report for controller 1');
  });

  it('serializes configuration reports with publication for the same controller', async () => {
    const { service, revisionRepository } = createService([{ ...controller(), trustState: 'claimed' as const }]);
    const revision = {
      id: 1,
      controllerId: 1,
      revision: 2,
      snapshot: '{}',
      contentHash: 'a'.repeat(64),
      state: 'published' as const,
      rejectionErrors: null,
      publishedAt: '2026-01-01T00:00:00.000Z',
      reportedAt: null,
    };
    revisionRepository.findOneBy.mockResolvedValue(revision);
    const withConfigurationLock = (
      Reflect.get(service, 'withConfigurationLock') as <T>(id: number, operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    const onConfigurationReported = (
      Reflect.get(service, 'onConfigurationReported') as (controllerId: number, payload: Buffer) => Promise<void>
    ).bind(service);
    let releasePublish!: () => void;
    const publish = withConfigurationLock(1, () => new Promise<void>((resolve) => (releasePublish = resolve)));
    const report = onConfigurationReported(
      1,
      Buffer.from(JSON.stringify({ revision: 2, contentHash: revision.contentHash })),
    );

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(revisionRepository.save).not.toHaveBeenCalled();
    releasePublish();
    await Promise.all([publish, report]);
    expect(revisionRepository.save).toHaveBeenCalledWith(expect.objectContaining({ state: 'applied' }));
  });

  it('routes configuration reports through independent bounded controller queues', async () => {
    const first = { ...controller(), trustState: 'claimed' as const };
    const second = { ...controller(), id: 2, hardwareId: 'cc100-02', trustState: 'claimed' as const };
    const { service, context } = createService([first, second]);
    let releaseFirst!: () => void;
    const onConfigurationReported = jest
      .spyOn(
        service as unknown as { onConfigurationReported: WagoService['onConfigurationReported'] },
        'onConfigurationReported',
      )
      .mockImplementation((controllerId) =>
        controllerId === first.id ? new Promise<void>((resolve) => (releaseFirst = resolve)) : Promise.resolve(),
      );

    await service.onApplicationBootstrap();

    const reportSubscriptions = (context.mqtt.subscribe as jest.Mock).mock.calls.filter(([, topic]) =>
      topic.endsWith('/configuration/reported'),
    );
    expect(reportSubscriptions).toHaveLength(1);
    expect(reportSubscriptions[0][1]).toBe('attraccess/wago/v1/controllers/+/configuration/reported');
    const handler = reportSubscriptions[0][2] as (message: { topic: string; payload: Buffer }) => void;
    const firstResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
      payload: Buffer.from('{}'),
    });
    const secondResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-02/configuration/reported',
      payload: Buffer.from('{}'),
    });

    expect(firstResult).toBeUndefined();
    expect(secondResult).toBeUndefined();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(onConfigurationReported).toHaveBeenCalledWith(second.id, expect.any(Buffer));
    releaseFirst();
  });

  it('retains queued reports for each revision of a busy controller', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context } = createService([claimed]);
    let releaseFirst!: () => void;
    const processed: Buffer[] = [];
    jest
      .spyOn(
        service as unknown as { onConfigurationReported: WagoService['onConfigurationReported'] },
        'onConfigurationReported',
      )
      .mockImplementation((_controllerId, payload) => {
        processed.push(payload);
        return processed.length === 1 ? new Promise<void>((resolve) => (releaseFirst = resolve)) : Promise.resolve();
      });

    await service.onApplicationBootstrap();

    const reportSubscription = (context.mqtt.subscribe as jest.Mock).mock.calls.find(([, topic]) =>
      topic.endsWith('/configuration/reported'),
    );
    const handler = reportSubscription?.[2] as (message: { topic: string; payload: Buffer }) => void;
    const first = Buffer.from('{"revision":1}');
    const second = Buffer.from('{"revision":2}');
    const third = Buffer.from('{"revision":3}');
    handler({ topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported', payload: first });
    await new Promise<void>((resolve) => setImmediate(resolve));
    handler({ topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported', payload: second });
    handler({ topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported', payload: third });

    expect(processed).toEqual([first]);
    releaseFirst();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(processed).toEqual([first, second, third]);
  });

  it('bounds queued reports for a busy controller while retaining replacements', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, context } = createService([claimed]);
    let releaseFirst!: () => void;
    const processed: Buffer[] = [];
    jest
      .spyOn(
        service as unknown as { onConfigurationReported: WagoService['onConfigurationReported'] },
        'onConfigurationReported',
      )
      .mockImplementation((_controllerId, payload) => {
        processed.push(payload);
        return processed.length === 1 ? new Promise<void>((resolve) => (releaseFirst = resolve)) : Promise.resolve();
      });

    await service.onApplicationBootstrap();

    const reportSubscription = (context.mqtt.subscribe as jest.Mock).mock.calls.find(([, topic]) =>
      topic.endsWith('/configuration/reported'),
    );
    const handler = reportSubscription?.[2] as (message: { topic: string; payload: Buffer }) => void;
    handler({
      topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
      payload: Buffer.from('{"revision":1}'),
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    for (let revision = 2; revision <= 101; revision += 1)
      handler({
        topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
        payload: Buffer.from(`{"revision":${revision}}`),
      });
    const replacement = Buffer.from('{"revision":2,"replacement":true}');
    handler({ topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported', payload: replacement });
    handler({
      topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
      payload: Buffer.from('{"revision":102}'),
    });

    releaseFirst();
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(processed).toHaveLength(101);
    expect(processed).toContain(replacement);
    expect(processed).not.toContainEqual(Buffer.from('{"revision":102}'));
    expect(context.logger.warn).toHaveBeenCalledWith('Dropping excess WAGO configuration report for controller 1');
  });

  it('returns bounded revision metadata pages without snapshots', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, revisionRepository } = createService([claimed]);

    await expect(service.revisionsFor(claimed.id, 5, 200)).resolves.toEqual({ revisions: [], offset: 5, limit: 100 });
    expect(revisionRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 100,
        select: expect.not.arrayContaining(['snapshot']),
      }),
    );
  });

  it('starts the editor from the last applied revision without creating a draft', async () => {
    const { service, revisionRepository, draftRepository } = createService([
      { ...controller(), trustState: 'claimed' },
    ]);
    const revision = {
      revision: 4,
      state: 'applied',
      snapshot: '{"version":1,"physicalPoints":[],"logicalChannels":[]}',
    };
    revisionRepository.find.mockResolvedValue([revision]);
    expect(await service.getConfigurationBaseline(1)).toBe(revision);
    expect(revisionRepository.find).toHaveBeenCalledWith({
      where: { controllerId: 1, state: 'applied' },
      order: { revision: 'DESC' },
      take: 1,
    });
    expect(draftRepository.save).not.toHaveBeenCalled();
  });

  it('rejects stale editor saves inside the configuration lock, including metadata-only changes', async () => {
    const { service, draftRepository } = createService([{ ...controller(), trustState: 'claimed' }]);
    const snapshot = { version: 1, physicalPoints: [], logicalChannels: [] };
    const previous = {
      controllerId: 1,
      snapshot: JSON.stringify(snapshot),
      updatedAt: 'same-timestamp',
      presetProvenance: '{"editor":{"names":{},"presets":[]}}',
    };
    draftRepository.findOneBy.mockResolvedValue(previous);
    await expect(service.saveDraft(1, snapshot, undefined, undefined, null)).rejects.toThrow('Saved draft changed');
    await expect(
      service.saveDraft(1, snapshot, undefined, undefined, { ...previous, presetProvenance: null }),
    ).rejects.toThrow('Saved draft changed');
    expect(draftRepository.save).not.toHaveBeenCalled();
    expect(JSON.parse((await service.saveDraft(1, snapshot, undefined, undefined, previous)).snapshot)).toEqual(
      snapshot,
    );
    expect(draftRepository.save).toHaveBeenCalledTimes(1);
  });
});
