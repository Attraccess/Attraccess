import type { WagoServiceTestScope } from './wago.service.spec';
import { WagoEnrollment } from './wago-enrollment.entity';

export function registerDoesNotBlockUnrelatedClaimsWhileDeliveringCredentials(scope: WagoServiceTestScope): void {
  it('does not block unrelated claims while delivering credentials', async () => {
    const first = { ...scope.controller(), enrollmentId: 3, fingerprint: 'first-fingerprint' };
    const second = {
      ...scope.controller(),
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
    const { service, enrollmentRepository, context } = scope.createService([first, second], enrollments);
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
}

export function registerDoesNotExposePhysicalVerificationSecretsInControllerListings(
  scope: WagoServiceTestScope,
): void {
  it('does not expose physical-verification secrets in controller listings', async () => {
    const { service } = scope.createService();

    const [listed] = await service.list();

    expect(listed).not.toHaveProperty('fingerprint');
    expect(listed).not.toHaveProperty('pairingCodeHash');
  });
}

export function registerDoesNotOverwriteADefaultMqttServerConfiguredWhileSettingsAreInitialized(
  scope: WagoServiceTestScope,
): void {
  it('does not overwrite a default MQTT server configured while settings are initialized', async () => {
    const { service, settingsRepository, settingsQuery } = scope.createService();
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
}

export function registerDoesNotOverwriteNewlyCommittedBrokerOrCredentialBindingsWithAnInFlightOldHeartbeat(
  scope: WagoServiceTestScope,
): void {
  it('does not overwrite newly committed broker or credential bindings with an in-flight old heartbeat', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const, credentialEpoch: 'old-epoch' };
    const { service, controllerRepository } = scope.createService([claimed]);
    controllerRepository.findOneBy.mockResolvedValue({ ...claimed });
    controllerRepository.save.mockImplementation(async (snapshot) => {
      // The SSH transaction commits after the heartbeat read and before its save.
      claimed.mqttServerId = 3;
      claimed.credentialEpoch = 'new-epoch';
      Object.assign(claimed, snapshot);
      return claimed;
    });
    const onHeartbeat = (Reflect.get(service, 'onHeartbeat') as (id: string, payload: Buffer) => Promise<void>).bind(
      service,
    );
    await onHeartbeat(
      claimed.hardwareId,
      Buffer.from(
        JSON.stringify({
          hardwareId: claimed.hardwareId,
          protocolVersion: '1.0.0',
          runtimeVersion: '1.0.0',
          capabilities: ['claim', 'heartbeat', 'configuration-v1'],
        }),
      ),
    );
    expect(claimed.mqttServerId).toBe(3);
    expect(claimed.credentialEpoch).toBe('new-epoch');
    expect(claimed.lastHeartbeatAt).toBeTruthy();
  });
}

export function registerDoesNotRegressAPersistedHeartbeatWithAnOlderCanonicalHeartbeatWhenTheDiagnosticsCache(
  scope: WagoServiceTestScope,
): void {
  it('does not regress a persisted heartbeat with an older canonical heartbeat when the diagnostics cache is full', async () => {
    const timestamp = new Date(Date.now() - 60_000).toISOString();
    const claimed = {
      ...scope.controller(),
      id: 257,
      trustState: 'claimed' as const,
      lastHeartbeatAt: new Date(Date.now()).toISOString(),
      lastSeenAt: new Date(Date.now() - 31_000).toISOString(),
    };
    const { service, controllerRepository } = scope.createService([claimed]);
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
        }),
      ),
    );

    expect(controllerRepository.save).not.toHaveBeenCalled();
    expect(claimed.lastHeartbeatAt).not.toBe(timestamp);
  });
}

export function registerDoesNotRevokeCredentialsAgainAfterRevocationWasRecorded(scope: WagoServiceTestScope): void {
  it('does not revoke credentials again after revocation was recorded', async () => {
    const enrollment = {
      id: 3,
      mqttServerId: 2,
      identity: 'wago-enrollment-test',
      revokedAt: '2026-01-01T00:00:00.000Z',
      consumedAt: null,
    } as WagoEnrollment;
    const { service, enrollmentRepository, context } = scope.createService([], [enrollment]);
    const revoke = jest.fn();
    (context.getMqttCredentialProvisioning as jest.Mock).mockReturnValue({ revoke });
    const revokeEnrollment = (Reflect.get(service, 'revokeEnrollment') as (item: WagoEnrollment) => Promise<void>).bind(
      service,
    );

    await revokeEnrollment(enrollment);

    expect(revoke).not.toHaveBeenCalled();
    expect(enrollmentRepository.save).toHaveBeenCalledWith(expect.objectContaining({ consumedAt: expect.any(String) }));
  });
}

export function registerDoesNotTreatRevokedEnrollmentsAsActive(scope: WagoServiceTestScope): void {
  it('does not treat revoked enrollments as active', () => {
    const { service } = scope.createService();
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
}

export function registerFailsStartupWhenWagoSubscriptionConfigurationCannotBeRead(scope: WagoServiceTestScope): void {
  it('fails startup when WAGO subscription configuration cannot be read', async () => {
    const { service, context, settingsRepository } = scope.createService([], [], 2);
    settingsRepository.findOneBy.mockRejectedValue(new Error('settings unavailable'));

    await expect(service.onApplicationBootstrap()).rejects.toThrow('settings unavailable');

    expect(context.logger.warn).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });
}

export function registerIgnoresControllerRejectionsWithoutFieldLevelErrorDetails(scope: WagoServiceTestScope): void {
  it('ignores controller rejections without field-level error details', async () => {
    const { service, revisionRepository, context } = scope.createService([
      { ...scope.controller(), trustState: 'claimed' as const },
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
}
