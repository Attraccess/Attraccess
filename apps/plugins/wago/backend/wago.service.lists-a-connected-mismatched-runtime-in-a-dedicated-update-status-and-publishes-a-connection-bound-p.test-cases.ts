import type { WagoServiceTestScope } from './wago.service.spec';

export function registerListsAConnectedMismatchedRuntimeInADedicatedUpdateStatusAndPublishesAConnectionBoundP(
  scope: WagoServiceTestScope,
): void {
  it('lists a connected mismatched runtime in a dedicated update status and publishes a connection-bound policy', async () => {
    const claimed = {
      ...scope.controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date().toISOString(),
    };
    const { service, context, revisionRepository } = scope.createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);
    expect((await service.list())[0].connectivity).toBe('runtime_check');
    revisionRepository.find.mockResolvedValueOnce([
      { revision: 1, snapshot: JSON.stringify({ logicalChannels: [{ id: 'load', capabilities: ['output'] }] }) },
    ]);
    await expect(
      service.executeCommand({
        controllerId: 1,
        channelId: 'load',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
      }),
    ).rejects.toThrow('Runtime update required');
    expect(context.mqtt.publish).not.toHaveBeenCalled();
    const desired = `sha256:${'a'.repeat(64)}`;
    await service.setRuntimePolicy(1, desired, `sha256:${'b'.repeat(64)}`, 'connection-token');
    expect((await service.list())[0].connectivity).toBe('runtime_update');
    expect(context.mqtt.publish).toHaveBeenCalledWith(
      2,
      expect.stringContaining('configuration/desired'),
      JSON.stringify({ runtimeImageId: desired, runtimePolicyToken: 'connection-token' }),
      { qos: 1, retain: false },
    );
    await service.setRuntimePolicy(1, desired, desired, 'connection-token');
    expect((await service.list())[0].connectivity).toBe('online');
  });
}

export function registerListsAnOfflineControllerAsStaleAfterRestartingRuntimeMonitoring(
  scope: WagoServiceTestScope,
): void {
  it('lists an offline controller as stale after restarting runtime monitoring', async () => {
    const claimed = {
      ...scope.controller(),
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    };
    const { service } = scope.createService([claimed]);
    service.registerRuntimeStatusHandler(() => undefined);

    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('stale');

    await service.setRuntimePolicy(
      claimed.id,
      `sha256:${'a'.repeat(64)}`,
      `sha256:${'b'.repeat(64)}`,
      'connection-token',
    );
    expect(service.isRuntimeUpdateRequired(claimed.id)).toBe(true);
    expect((await service.list())[0].connectivity).toBe('stale');
  });
}

export function registerPersistsAValidCanonicalHeartbeatWhenTheBoundedDiagnosticsCacheIsFull(
  scope: WagoServiceTestScope,
): void {
  it('persists a valid canonical heartbeat when the bounded diagnostics cache is full', async () => {
    const claimed = { ...scope.controller(), id: 257, trustState: 'claimed' as const };
    const { service, controllerRepository } = scope.createService([claimed]);
    const updateEvidence = jest.fn();
    service.registerRuntimeStatusHandler(updateEvidence);
    const timestamp = new Date().toISOString();
    const streamId = '00000000-0000-4000-8000-000000000001';
    for (let id = 1; id <= 256; id++) {
      service.diagnostics.ingest(id, 'heartbeat', Buffer.from(JSON.stringify({ timestamp, streamId, sequence: 1 })));
    }
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
          timestamp,
          streamId,
          sequence: 1,
          runtimeImageId: `sha256:${'a'.repeat(64)}`,
        }),
      ),
    );

    expect(service.diagnostics.read(claimed.id).heartbeatAt).toBeUndefined();
    expect(updateEvidence).toHaveBeenCalledWith(
      claimed.id,
      expect.objectContaining({ imageId: `sha256:${'a'.repeat(64)}`, streamId, sequence: 1 }),
    );
    expect(controllerRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ lastHeartbeatAt: timestamp, lastSeenAt: expect.any(String) }),
    );
  });
}

export function registerPersistsAnEnrollmentRecoveryRecordBeforeProvisioningTheBrokerCredential(
  scope: WagoServiceTestScope,
): void {
  it('persists an enrollment recovery record before provisioning the broker credential', async () => {
    const { service, context, enrollmentRepository } = scope.createService([], [], 2);
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
}

export function registerPreservesRetainedStateDeliveredBeforeReplacementSubscriptionsActivate(
  scope: WagoServiceTestScope,
): void {
  it('preserves retained state delivered before replacement subscriptions activate', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context } = scope.createService([claimed], [], 2);
    const subscribeConfiguredServers = (Reflect.get(service, 'subscribeConfiguredServers') as () => Promise<void>).bind(
      service,
    );
    await subscribeConfiguredServers();
    const retained = Buffer.from(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        streamId: '00000000-0000-4000-8000-000000000001',
        sequence: 1,
        connected: true,
        revision: 1,
        contentHash: 'a'.repeat(64),
        outputs: { relay: true },
      }),
    );
    (context.mqtt.subscribe as jest.Mock).mockImplementation(async (_serverId, topic, callback) => {
      if (topic.endsWith('/state')) await callback({ topic, payload: retained });
      return { unsubscribe: jest.fn() };
    });

    await subscribeConfiguredServers();

    expect(service.diagnostics.read(claimed.id).outputs.relay.value).toBe(true);
  });
}

export function registerPreservesTheClaimFailureWhenRestoringTheControllerStateFails(
  scope: WagoServiceTestScope,
): void {
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
    const candidate = { ...scope.controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = scope.createService(
      [candidate],
      [enrollment],
    );
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
}

export function registerPreservesTheMqttServerDuringAPrefixOnlySettingsUpdate(scope: WagoServiceTestScope): void {
  it('preserves the MQTT server during a prefix-only settings update', async () => {
    const { service, settingsRepository } = scope.createService([], [], 2);

    await service.setSettings(undefined, 'customer/wago');

    expect(settingsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultMqttServerId: 2, operationalPrefix: 'customer/wago' }),
    );
  });
}

export function registerPropagatesAControllerAcknowledgementRejectionMessage(scope: WagoServiceTestScope): void {
  it('propagates a controller acknowledgement rejection message', async () => {
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
}
