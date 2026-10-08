import { WagoEnrollment } from './wago-enrollment.entity';
import { controller, createWagoServiceFixture } from './wago-service.test-fixture';
import { WagoService } from './wago.service';

describe('WagoService enrollment and claim lifecycle', () => {
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

  it('revokes a claimed controller before deleting its local records', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const, enrollmentId: null };
    const { service, context, controllerRepository, draftRepository, revisionRepository } = createService([claimed]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });

    await expect(service.remove(claimed.id)).resolves.toBe(claimed.hardwareId);

    expect(revoke).toHaveBeenCalledWith({
      mqttServerId: claimed.mqttServerId,
      identity: `wago-controller-${claimed.hardwareId}`,
      username: `wago-controller-${claimed.hardwareId}`,
      vhost: '/',
    });
    expect(draftRepository.delete).toHaveBeenCalledWith({ controllerId: claimed.id });
    expect(revisionRepository.delete).toHaveBeenCalledWith({ controllerId: claimed.id });
    expect(controllerRepository.delete).toHaveBeenCalledWith(claimed.id);
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
    const provision = jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' });
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision,
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
    expect(provision).toHaveBeenCalledWith(
      expect.objectContaining({
        topicPolicy: expect.objectContaining({
          subscribe: expect.arrayContaining(['attraccess/wago/v1/controllers/cc100-01/credentials/rotate']),
        }),
      }),
    );
  });

  it('revokes bootstrap credentials only after the controller acknowledges durable claim storage', async () => {
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
    const revoke = jest.fn().mockResolvedValue(undefined);
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest.fn().mockResolvedValue({});
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ username: 'wago-controller-cc100-01', password: 'secret' }),
      revoke,
    });
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);

    await service.claim(candidate.id, 'Controller', 'fingerprint');

    expect(revoke).not.toHaveBeenCalled();
    const claimPayload = JSON.parse((context.mqtt.publish as jest.Mock).mock.calls[0][2]) as {
      acknowledgementToken: string;
    };
    const acknowledgementHandler = (context.mqtt.subscribe as jest.Mock).mock.calls[0][2] as (message: {
      payload: Buffer;
    }) => Promise<void>;
    await acknowledgementHandler({
      payload: Buffer.from(JSON.stringify({ acknowledgementToken: claimPayload.acknowledgementToken })),
    });

    expect(revoke).toHaveBeenCalledWith(expect.objectContaining({ identity: enrollment.identity }));
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

  it('revokes an expired enrollment credential before commissioning deletes its record', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      hardwareId: 'cc100-01',
      identity: 'wago-enrollment-expired',
      expiresAt: '2020-01-01T00:00:00.000Z',
      revokedAt: null,
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = createService([], [enrollment]);
    const revoke = jest.fn().mockResolvedValue(undefined);
    enrollmentRepository.findOneBy.mockResolvedValue(enrollment);
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });

    await service.revokeEnrollmentById(enrollment.id);

    expect(revoke).toHaveBeenCalledWith({
      mqttServerId: enrollment.mqttServerId,
      identity: enrollment.identity,
      username: enrollment.identity,
      vhost: '/',
    });
    expect(enrollment).toMatchObject({ revokedAt: expect.any(String), consumedAt: expect.any(String) });
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
    service.onModuleDestroy();
  });

  it('discards a manual enrollment recovery record when credentials are not supplied', async () => {
    const { service, context, enrollmentRepository } = createService([], [], 2);
    enrollmentRepository.save.mockImplementation(async (value) => ({ ...value, id: 17 }));
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({
      provision: jest.fn().mockResolvedValue({ instructions: ['Create the scoped broker user manually.'] }),
    });

    await expect(service.createEnrollment('cc100-01')).rejects.toThrow('Manual discovery credentials are required');

    expect(enrollmentRepository.delete).toHaveBeenCalledWith(17);
    expect(service['enrollmentExpiryTimers'].size).toBe(0);
  });

  it.each(['cc100/+1', 'cc100/#1'])('rejects MQTT wildcard characters in hardware IDs', async (hardwareId) => {
    const { service } = createService();

    await expect(service.createEnrollment(hardwareId)).rejects.toThrow('without MQTT separators or wildcards');
  });

  it('persists an enrollment recovery record before provisioning the broker credential', async () => {
    const { service, context, enrollmentRepository } = createService([], [], 2);
    const provision = jest.fn().mockResolvedValue({ username: 'ignored', password: 'secret' });
    const assertOwned = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('lease lost'));
    (context as unknown as { getMqttServerConfig: jest.Mock }).getMqttServerConfig = jest
      .fn()
      .mockResolvedValue({ host: 'mqtt.example.test', port: 8883, useTls: true });
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ provision });

    await expect(service.createEnrollment('cc100-01', undefined, undefined, assertOwned)).rejects.toThrow('lease lost');

    expect(enrollmentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ hardwareId: 'cc100-01', identity: expect.stringMatching(/^wago-enrollment-/) }),
    );
    expect(enrollmentRepository.save.mock.invocationCallOrder[0]).toBeLessThan(provision.mock.invocationCallOrder[0]);
    service.onModuleDestroy();
  });

  it('leaves bootstrap credentials available until expiry after a post-delivery claim failure', async () => {
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
    expect(revoke).not.toHaveBeenCalled();
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
    controllerRepository.save
      .mockResolvedValueOnce(candidate) // provisioning intent
      .mockResolvedValueOnce(candidate) // claimed state
      .mockRejectedValueOnce(rollbackError);
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
