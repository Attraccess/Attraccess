import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { configurationHash } from './configuration';

describe('WagoService', () => {
  const controller = (): WagoController => ({
    id: 1,
    hardwareId: 'cc100-01',
    trustState: 'untrusted',
    name: null,
    mqttServerId: 2,
    enrollmentId: 3,
    pairingCodeHash: 'pairing-hash',
    fingerprint: '',
    protocolVersion: '1.0.0',
    runtimeVersion: '1.0.0',
    capabilities: '["claim","heartbeat","configuration-v1"]',
    lastSequence: 4,
    lastHeartbeatAt: null,
    lastSeenAt: '2026-01-01T00:00:00.000Z',
    compatibilityError: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  function createService(
    controllers = [controller()],
    enrollments: WagoEnrollment[] = [],
    defaultMqttServerId: number | null = null,
  ) {
    const controllerRepository = {
      find: jest.fn().mockResolvedValue(controllers),
      findOneBy: jest
        .fn()
        .mockImplementation(
          async (where) =>
            controllers.find((item) => ('id' in where ? item.id === where.id : item.hardwareId === where.hardwareId)) ??
            null,
        ),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const enrollmentQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(enrollments),
    };
    const enrollmentRepository = {
      find: jest.fn().mockResolvedValue(enrollments),
      findOneBy: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
      createQueryBuilder: jest.fn().mockReturnValue(enrollmentQuery),
    };
    const settingsRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: 1, defaultMqttServerId, operationalPrefix: 'attraccess/wago' }),
      save: jest.fn(),
      findOneByOrFail: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const draftRepository = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const revisionRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockImplementation(async (value) => value),
    };
    const settingsQuery = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    settingsRepository.createQueryBuilder.mockReturnValue(settingsQuery);
    const subscriptions: Array<{ unsubscribe: jest.Mock }> = [];
    const context = {
      getRepository: jest.fn((entity) => {
        if (entity === WagoController) return controllerRepository;
        if (entity === WagoEnrollment) return enrollmentRepository;
        if (entity === WagoSettings) return settingsRepository;
        if (entity === WagoConfigurationDraft) return draftRepository;
        if (entity === WagoConfigurationRevision) return revisionRepository;
        throw new Error('unexpected repository');
      }),
      logger: { warn: jest.fn() },
      mqtt: {
        subscribe: jest.fn().mockImplementation(async () => {
          const subscription = { unsubscribe: jest.fn() };
          subscriptions.push(subscription);
          return subscription;
        }),
        publish: jest.fn(),
      },
      getMqttCredentialProvisioning: jest.fn(),
    } as unknown as PluginContext;
    return {
      service: new WagoService(context),
      controllerRepository,
      enrollmentRepository,
      settingsRepository,
      settingsQuery,
      draftRepository,
      revisionRepository,
      context,
      subscriptions,
    };
  }

  it('does not expose physical-verification secrets in controller listings', async () => {
    const { service } = createService();

    const [listed] = await service.list();

    expect(listed).not.toHaveProperty('fingerprint');
    expect(listed).not.toHaveProperty('pairingCodeHash');
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
      reviewedHash: configurationHash(snapshot),
      snapshot: JSON.stringify(snapshot),
    });

    await expect(service.publishDraft(claimed.id)).rejects.toThrow('configuration-v1');
  });

  it('delivers the controller-scoped configuration namespace with claim credentials', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      secretHash: 'secret-hash',
      identity: 'wago-enrollment-test',
      createdAt: '',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    };
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, enrollmentRepository } = createService([candidate], [enrollment]);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);

    await service.claim(candidate.id, 'Controller', 'fingerprint');

    expect(context.mqtt.publish).toHaveBeenCalledWith(
      2,
      'attraccess/wago/discovery/cc100-01/claim',
      expect.stringContaining('"desiredTopic":"attraccess/wago/v1/controllers/cc100-01/configuration/desired"'),
      { qos: 1 },
    );
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
          errors: [{ path: 'logicalChannels[0]', code: 'unsupported_capability' }],
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

  it('routes configuration reports through one backpressured wildcard subscription', async () => {
    const first = { ...controller(), trustState: 'claimed' as const };
    const second = { ...controller(), id: 2, hardwareId: 'cc100-02', trustState: 'claimed' as const };
    const { service, context } = createService([first, second]);
    let releaseFirst!: () => void;
    const onConfigurationReported = jest
      .spyOn(service as never, 'onConfigurationReported')
      .mockImplementation((controllerId) =>
        controllerId === first.id ? new Promise<void>((resolve) => (releaseFirst = resolve)) : Promise.resolve(),
      );

    await service.onModuleInit();

    const reportSubscriptions = (context.mqtt.subscribe as jest.Mock).mock.calls.filter(([, topic]) =>
      topic.endsWith('/configuration/reported'),
    );
    expect(reportSubscriptions).toHaveLength(1);
    expect(reportSubscriptions[0][1]).toBe('attraccess/wago/v1/controllers/+/configuration/reported');
    const handler = reportSubscriptions[0][2] as (message: { topic: string; payload: Buffer }) => Promise<void> | undefined;
    const firstResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-01/configuration/reported',
      payload: Buffer.from('{}'),
    });
    const secondResult = handler({
      topic: 'attraccess/wago/v1/controllers/cc100-02/configuration/reported',
      payload: Buffer.from('{}'),
    });

    expect(firstResult).toBeInstanceOf(Promise);
    expect(secondResult).toBeInstanceOf(Promise);
    expect(onConfigurationReported).toHaveBeenCalledWith(second.id, expect.any(Buffer));
    releaseFirst();
    await Promise.all([firstResult, secondResult]);
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

  it('serializes concurrent claims for the same controller', async () => {
    const { service } = createService();
    const withClaimLock = (
      Reflect.get(service, 'withClaimLock') as <T>(id: number, operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    const started: number[] = [];
    let release!: () => void;
    const first = withClaimLock(1, async () => {
      started.push(1);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    const second = withClaimLock(1, async () => started.push(2));

    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(started).toEqual([1]);
    release();
    await Promise.all([first, second]);
    expect(started).toEqual([1, 2]);
  });

  it('does not block unrelated claims while delivering credentials', async () => {
    const first = { ...controller(), enrollmentId: 3, fingerprint: 'first-fingerprint' };
    const second = {
      ...controller(),
      id: 2,
      hardwareId: 'cc100-02',
      enrollmentId: 4,
      fingerprint: 'second-fingerprint',
    };
    const enrollments = [
      {
        id: 3,
        mqttServerId: 2,
        hardwareId: first.hardwareId,
        secretHash: 'first',
        identity: 'enrollment-first',
        createdAt: '',
        expiresAt: '2999-01-01T00:00:00.000Z',
        revokedAt: null,
        consumedAt: null,
      },
      {
        id: 4,
        mqttServerId: 2,
        hardwareId: second.hardwareId,
        secretHash: 'second',
        identity: 'enrollment-second',
        createdAt: '',
        expiresAt: '2999-01-01T00:00:00.000Z',
        revokedAt: null,
        consumedAt: null,
      },
    ];
    const { service, enrollmentRepository, context } = createService([first, second], enrollments);
    enrollmentRepository.findOneBy.mockImplementation(
      async ({ id }) => enrollments.find((item) => item.id === id) ?? null,
    );
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    const provision = jest.fn().mockImplementation(({ username }) => ({ username, password: 'permanent-password' }));
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ provision, revoke: jest.fn() });
    let releaseFirstDelivery!: () => void;
    const firstDelivery = new Promise<void>((resolve) => {
      releaseFirstDelivery = resolve;
    });
    (context.mqtt.publish as jest.Mock).mockImplementation(async (_serverId, topic) => {
      if (topic === `${'attraccess/wago/discovery'}/cc100-01/claim`) await firstDelivery;
    });

    const firstClaim = service.claim(first.id, 'First', first.fingerprint);
    await new Promise<void>((resolve) => setImmediate(resolve));
    const secondClaim = service.claim(second.id, 'Second', second.fingerprint);

    await expect(
      new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('second claim was blocked by credential delivery')), 100);
        const wait = () => {
          if (provision.mock.calls.length === 2) {
            clearTimeout(timer);
            resolve();
          } else setImmediate(wait);
        };
        wait();
      }),
    ).resolves.toBeUndefined();
    releaseFirstDelivery();
    await Promise.all([firstClaim, secondClaim]);
  });

  it('keeps a manually revocable enrollment active', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      secretHash: 'secret-hash',
      identity: 'wago-enrollment-test',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T01:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    };
    const { service, enrollmentRepository, context } = createService([], [enrollment]);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      revoke: jest.fn().mockResolvedValue({ instructions: ['Remove this account manually.'] }),
    });
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await expect(revokeEnrollment(enrollment)).rejects.toThrow('Manual credential revocation is required');

    expect(enrollment.consumedAt).toBeNull();
    expect(enrollmentRepository.save).not.toHaveBeenCalled();
  });

  it('returns administrator supplied manual credentials when automatic provisioning is unavailable', async () => {
    const { service, context } = createService([], [], 2);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockImplementation(({ username }) => ({
        instructions: [`Create a scoped broker user named ${username} manually.`],
      })),
    });

    const enrollment = await service.createEnrollment('cc100-01', undefined, {
      username: 'manual-$&',
      password: 'secret',
    });

    expect(enrollment).toMatchObject({ username: 'manual-$&', password: 'secret' });
    expect(enrollment.manualInstructions).toEqual(['Create a scoped broker user named manual-$& manually.']);
  });

  it.each(['cc100/+1', 'cc100/#1'])('rejects MQTT wildcard characters in hardware IDs', async (hardwareId) => {
    const { service } = createService();

    await expect(service.createEnrollment(hardwareId)).rejects.toThrow('without MQTT separators or wildcards');
  });

  it('keeps permanent credentials after a post-delivery claim failure', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      secretHash: 'secret-hash',
      identity: 'wago-enrollment-test',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    };
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = createService([candidate], [enrollment]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke,
    });
    (context.mqtt.publish as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('cleanup failed'));
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toThrow('cleanup failed');

    expect(controllerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ trustState: 'claimed' }));
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ identity: enrollment.identity }));
  });

  it('preserves the claim failure when restoring the controller state fails', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      secretHash: 'secret-hash',
      identity: 'wago-enrollment-test',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    };
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = createService([candidate], [enrollment]);
    const claimError = new Error('credential delivery failed');
    const rollbackError = new Error('controller rollback failed');
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    (context.mqtt.publish as jest.Mock).mockRejectedValue(claimError);
    controllerRepository.save.mockResolvedValueOnce(candidate).mockRejectedValueOnce(rollbackError);
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toBe(claimError);

    expect(context.logger.warn).toHaveBeenCalledWith(
      `Could not restore WAGO controller ${candidate.id} after claim failure: Error: controller rollback failed`,
    );
  });

  it('releases the claim configuration lock after preparation fails', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      secretHash: 'secret-hash',
      identity: 'wago-enrollment-test',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    };
    const candidate = { ...controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = createService([candidate], [enrollment]);
    const claimError = new Error('could not persist claimed controller');
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    controllerRepository.save.mockRejectedValueOnce(claimError);
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);

    await expect(service.claim(candidate.id, 'Controller', 'fingerprint')).rejects.toBe(claimError);
    const withClaimConfigurationLock = (
      Reflect.get(service, 'withClaimConfigurationLock') as <T>(operation: () => Promise<T>) => Promise<T>
    ).bind(service);
    await expect(withClaimConfigurationLock(async () => 'available')).resolves.toBe('available');
  });

  it('does not treat revoked enrollments as active', () => {
    const { service } = createService();
    const isActiveEnrollment = Reflect.get(service, 'isActiveEnrollment') as (item: WagoEnrollment) => boolean;

    expect(
      isActiveEnrollment({
        id: 3,
        mqttServerId: 2,
        hardwareId: 'cc100-01',
        secretHash: 'secret-hash',
        identity: 'wago-enrollment-test',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: '2099-01-01T00:00:00.000Z',
        revokedAt: '2026-01-01T00:00:00.000Z',
        consumedAt: null,
      }),
    ).toBe(false);
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

    const onDiscovery = jest.spyOn(service as never, 'onDiscovery').mockResolvedValue(undefined);
    await secondCallback(message);
    expect(onDiscovery).not.toHaveBeenCalled();

    finishSubscription();
    await rebuild;
    await firstCallback(message);
    await secondCallback(message);
    expect(onDiscovery).toHaveBeenCalledTimes(1);
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
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

  it('retains revocation progress when recording consumption fails', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      identity: 'wago-enrollment-test',
      revokedAt: null,
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = createService([], [enrollment]);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      revoke: jest.fn().mockResolvedValue(undefined),
    });
    (enrollmentRepository.save as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await expect(revokeEnrollment(enrollment)).rejects.toThrow('database unavailable');

    expect(enrollment.revokedAt).not.toBeNull();
    expect(enrollment.consumedAt).toBeNull();
  });

  it('does not revoke credentials again after revocation was recorded', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      identity: 'wago-enrollment-test',
      revokedAt: '2026-01-01T00:00:00.000Z',
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = createService([], [enrollment]);
    const revoke = jest.fn();
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await revokeEnrollment(enrollment);

    expect(revoke).not.toHaveBeenCalled();
    expect(enrollmentRepository.save).toHaveBeenCalledWith(expect.objectContaining({ consumedAt: expect.any(String) }));
  });
});
