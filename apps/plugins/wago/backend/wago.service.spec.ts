import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';
import { WagoSettings } from './wago-settings.entity';

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
    capabilities: '["claim","heartbeat"]',
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
      findOneBy: jest.fn().mockResolvedValue(controllers[0] ?? null),
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
    const settingsRepository = { findOneBy: jest.fn().mockResolvedValue({ id: 1, defaultMqttServerId }), save: jest.fn() };
    const subscriptions: Array<{ unsubscribe: jest.Mock }> = [];
    const context = {
      getRepository: jest.fn((entity) => {
        if (entity === WagoController) return controllerRepository;
        if (entity === WagoEnrollment) return enrollmentRepository;
        if (entity === WagoSettings) return settingsRepository;
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
    return { service: new WagoService(context), controllerRepository, enrollmentRepository, context, subscriptions };
  }

  it('does not expose physical-verification secrets in controller listings', async () => {
    const { service } = createService();

    const [listed] = await service.list();

    expect(listed).not.toHaveProperty('fingerprint');
    expect(listed).not.toHaveProperty('pairingCodeHash');
  });

  it('requires a non-empty matching fingerprint', () => {
    const { service } = createService();
    const matchesVerifier = Reflect.get(service, 'matchesVerifier') as (item: WagoController, value: string) => boolean;

    expect(matchesVerifier(controller(), '')).toBe(false);
  });

  it('accepts a heartbeat that omits the optional sequence', async () => {
    const claimed = { ...controller(), trustState: 'claimed' as const };
    const { service, controllerRepository } = createService([claimed]);
    const onHeartbeat = (Reflect.get(service, 'onHeartbeat') as (hardwareId: string, payload: Buffer) => Promise<void>).bind(
      service,
    );

    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          pairingCode: '482931',
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat'],
        }),
      ),
    );

    expect(controllerRepository.save).toHaveBeenCalledWith(expect.objectContaining({ lastSequence: 4 }));
  });

  it('serializes concurrent claims for the same controller', async () => {
    const { service } = createService();
    const withClaimLock = (Reflect.get(service, 'withClaimLock') as <T>(
      id: number,
      operation: () => Promise<T>,
    ) => Promise<T>).bind(service);
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
      username: 'manual-cc100-01',
      password: 'secret',
    });

    expect(enrollment).toMatchObject({ username: 'manual-cc100-01', password: 'secret' });
    expect(enrollment.manualInstructions).toEqual(['Create a scoped broker user named manual-cc100-01 manually.']);
  });

  it('keeps replacement subscriptions inert until they replace the active generation', async () => {
    const { service, context, subscriptions } = createService([], [], 2);
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(service);

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
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(service);

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
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke: jest.fn().mockResolvedValue(undefined) });
    (enrollmentRepository.save as jest.Mock).mockRejectedValue(new Error('database unavailable'));
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(service);

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
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(service);

    await revokeEnrollment(enrollment);

    expect(revoke).not.toHaveBeenCalled();
    expect(enrollmentRepository.save).toHaveBeenCalledWith(expect.objectContaining({ consumedAt: expect.any(String) }));
  });
});
