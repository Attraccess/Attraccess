import type { WagoServiceTestScope } from './wago.service.spec';
import { WagoService } from './wago.service';

export function registerAcceptsAHeartbeatThatOmitsTheOptionalSequence(scope: WagoServiceTestScope): void {
  it('accepts a heartbeat that omits the optional sequence', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, controllerRepository } = scope.createService([claimed]);
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
}

export function registerBindsNumericControllerIdsWhenLookingUpChannelReferences(scope: WagoServiceTestScope): void {
  it('binds numeric controller IDs when looking up channel references', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = scope.createService([claimed]);
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
}

export function registerBoundsQueuedReportsForABusyControllerWhileRetainingReplacements(
  scope: WagoServiceTestScope,
): void {
  it('bounds queued reports for a busy controller while retaining replacements', async () => {
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
}

export function registerChecksSoftwareAfterRestartingRuntimeMonitoringUntilTheRunningImageIsConfirmed(
  scope: WagoServiceTestScope,
): void {
  it('checks software after restarting runtime monitoring until the running image is confirmed', async () => {
    const claimed = {
      ...scope.controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date().toISOString(),
    };
    const { service } = scope.createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);

    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('runtime_check');

    const image = `sha256:${'a'.repeat(64)}`;
    await service.setRuntimePolicy(claimed.id, image, image, 'connection-token');
    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(false);
    expect((await service.list())[0].connectivity).toBe('online');
  });
}

export function registerConsumesAPendingAcknowledgementRejectionWhenCommandPublicationFails(
  scope: WagoServiceTestScope,
): void {
  it('consumes a pending acknowledgement rejection when command publication fails', async () => {
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
}

export function registerCreatesDefaultSettingsWhenNoneHaveBeenPersisted(scope: WagoServiceTestScope): void {
  it('creates default settings when none have been persisted', async () => {
    const { service, settingsRepository, settingsQuery } = scope.createService();
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
}

export function registerDeliversTheControllerScopedConfigurationNamespaceWithClaimCredentials(
  scope: WagoServiceTestScope,
): void {
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
    const candidate = { ...scope.controller(), fingerprint: 'fingerprint' };
    const { service, context, enrollmentRepository } = scope.createService([candidate], [enrollment]);
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
}

export function registerDiscardsAManualEnrollmentRecoveryRecordWhenCredentialsAreNotSupplied(
  scope: WagoServiceTestScope,
): void {
  it('discards a manual enrollment recovery record when credentials are not supplied', async () => {
    const { service, context, enrollmentRepository } = scope.createService([], [], 2);
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
}
