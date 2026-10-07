import type { WagoServiceTestScope } from './wago.service.spec';
import { WagoService } from './wago.service';
import { WagoEnrollment } from './wago-enrollment.entity';

export function registerRestoresMigratedControllerSubscriptionsAfterApiRestartWhileThePreviousDefaultBrokerIsUn(
  scope: WagoServiceTestScope,
): void {
  it('restores migrated controller subscriptions after API restart while the previous default broker is unreachable', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const, mqttServerId: 3 };
    const { service, context } = scope.createService([claimed], [], 2);
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
}

export function registerRetainsQueuedReportsForEachRevisionOfABusyController(scope: WagoServiceTestScope): void {
  it('retains queued reports for each revision of a busy controller', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context } = scope.createService([claimed]);
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
}

export function registerRetainsRevocationProgressWhenRecordingConsumptionFails(scope: WagoServiceTestScope): void {
  it('retains revocation progress when recording consumption fails', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      identity: 'wago-enrollment-test',
      revokedAt: null,
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = scope.createService([], [enrollment]);
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
}

export function registerRetriesMqttSubscriptionsInsteadOfFailingModuleStartup(scope: WagoServiceTestScope): void {
  it('retries MQTT subscriptions instead of failing module startup', async () => {
    const { service, context } = scope.createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(context.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not establish WAGO MQTT subscriptions during startup'),
    );
    service.onModuleDestroy();
  });
}

export function registerRetriesRuntimePolicyAfterPublicationSFailsWithoutUnblockingCommands(
  scope: WagoServiceTestScope,
): void {
  it.each([1, 2])(
    'retries runtime policy after publication %s fails without unblocking commands',
    async (failedPublication) => {
      const { service, context, revisionRepository } = scope.createService([
        { ...scope.controller(), trustState: 'claimed' },
      ]);
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
}

export function registerReturnsAdministratorSuppliedManualCredentialsWhenAutomaticProvisioningIsUnavailable(
  scope: WagoServiceTestScope,
): void {
  it('returns administrator supplied manual credentials when automatic provisioning is unavailable', async () => {
    const { service, context } = scope.createService([], [], 2);
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
}

export function registerReturnsBoundedRevisionMetadataPagesWithoutSnapshots(scope: WagoServiceTestScope): void {
  it('returns bounded revision metadata pages without snapshots', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, revisionRepository } = scope.createService([claimed]);

    await expect(service.revisionsFor(claimed.id, 5, 200)).resolves.toEqual({ revisions: [], offset: 5, limit: 100 });
    expect(revisionRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 5,
        take: 100,
        select: expect.not.arrayContaining(['snapshot']),
      }),
    );
  });
}

export function registerRevokesAClaimedControllerBeforeDeletingItsLocalRecords(scope: WagoServiceTestScope): void {
  it('revokes a claimed controller before deleting its local records', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const, enrollmentId: null };
    const { service, context, controllerRepository, draftRepository, revisionRepository } = scope.createService([
      claimed,
    ]);
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
}

export function registerRevokesBootstrapCredentialsOnlyAfterTheControllerAcknowledgesDurableClaimStorage(
  scope: WagoServiceTestScope,
): void {
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
    const candidate = { ...scope.controller(), fingerprint: 'fingerprint' };
    const { service, context, enrollmentRepository } = scope.createService([candidate], [enrollment]);
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
}
