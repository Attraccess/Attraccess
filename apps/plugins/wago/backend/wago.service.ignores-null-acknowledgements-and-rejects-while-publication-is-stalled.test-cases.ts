import type { WagoServiceTestScope } from './wago.service.spec';
import { WagoEnrollment } from './wago-enrollment.entity';
import { WagoService } from './wago.service';

export function registerIgnoresNullAcknowledgementsAndRejectsWhilePublicationIsStalled(
  scope: WagoServiceTestScope,
): void {
  it('ignores null acknowledgements and rejects while publication is stalled', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = scope.createService([claimed], [], 2);
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
}

export function registerIgnoresReportsForATerminalSRevisionState(scope: WagoServiceTestScope): void {
  it.each(['applied', 'rejected'] as const)('ignores reports for a terminal %s revision state', async (state) => {
    const { service, revisionRepository } = scope.createService([
      { ...scope.controller(), trustState: 'claimed' as const },
    ]);
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
}

export function registerKeepsAManuallyRevocableEnrollmentActive(scope: WagoServiceTestScope): void {
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
    const { service, enrollmentRepository, context } = scope.createService([], [enrollment]);
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
}

export function registerKeepsReplacementSubscriptionsInertUntilTheyReplaceTheActiveGeneration(
  scope: WagoServiceTestScope,
): void {
  it('keeps replacement subscriptions inert until they replace the active generation', async () => {
    const { service, context, subscriptions } = scope.createService([], [], 2);
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
}

export function registerKeepsTheHostRunningWhenInitialWagoMqttSubscriptionsFail(scope: WagoServiceTestScope): void {
  it('keeps the host running when initial WAGO MQTT subscriptions fail', async () => {
    const { service, context } = scope.createService([], [], 2);
    (context.mqtt.subscribe as jest.Mock).mockRejectedValue(new Error('broker unavailable'));

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();

    expect(context.logger.warn).toHaveBeenCalledWith(
      'Could not establish WAGO MQTT subscriptions during startup: Error: broker unavailable',
    );
    service.onModuleDestroy();
  });
}

export function registerKeepsTheMigratedBrokerActiveWhenAnOverlappingRebuildCapturedItsPreviousAssociation(
  scope: WagoServiceTestScope,
): void {
  it('keeps the migrated broker active when an overlapping rebuild captured its previous association', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context } = scope.createService([claimed], [], 2);
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
}

export function registerLeavesBootstrapCredentialsAvailableUntilExpiryAfterAPostDeliveryClaimFailure(
  scope: WagoServiceTestScope,
): void {
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
    const candidate = { ...scope.controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = scope.createService(
      [candidate],
      [enrollment],
    );
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
}
