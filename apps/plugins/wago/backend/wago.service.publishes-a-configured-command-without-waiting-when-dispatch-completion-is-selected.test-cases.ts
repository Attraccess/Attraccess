import type { WagoServiceTestScope } from './wago.service.spec';
import { configurationHash } from './configuration';

export function registerPublishesAConfiguredCommandWithoutWaitingWhenDispatchCompletionIsSelected(
  scope: WagoServiceTestScope,
): void {
  it('publishes a configured command without waiting when dispatch completion is selected', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, context, revisionRepository } = scope.createService([claimed], [], 2);
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
}

export function registerPublishesARetainedContentAddressedRevisionOnlyAfterValidation(
  scope: WagoServiceTestScope,
): void {
  it('publishes a retained, content-addressed revision only after validation', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const };
    const { service, draftRepository, revisionRepository, context } = scope.createService([claimed]);
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
}

export function registerRecordsStructuredControllerRejectionWithoutChangingThePublishedSnapshot(
  scope: WagoServiceTestScope,
): void {
  it('records structured controller rejection without changing the published snapshot', async () => {
    const { service, revisionRepository } = scope.createService([
      { ...scope.controller(), trustState: 'claimed' as const },
    ]);
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
}

export function registerRejectsAcknowledgementTimeoutsThatExceedTheSupportedMaximum(scope: WagoServiceTestScope): void {
  it('rejects acknowledgement timeouts that exceed the supported maximum', async () => {
    const { service } = scope.createService();

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
}

export function registerRejectsInvalidPersistedCommandPolicies(scope: WagoServiceTestScope): void {
  it('rejects invalid persisted command policies', async () => {
    const { service } = scope.createService();

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
}

export function registerRejectsPublicationForAClaimedRuntimeWithoutTheConfigurationContract(
  scope: WagoServiceTestScope,
): void {
  it('rejects publication for a claimed runtime without the configuration contract', async () => {
    const claimed = { ...scope.controller(), trustState: 'claimed' as const, capabilities: '["claim","heartbeat"]' };
    const { service, draftRepository } = scope.createService([claimed]);
    const snapshot = { version: 1, physicalPoints: [], logicalChannels: [] };
    draftRepository.findOneBy.mockResolvedValue({
      controllerId: claimed.id,
      reviewedHash: configurationHash({ snapshot: JSON.stringify(snapshot), metadata: null }),
      snapshot: JSON.stringify(snapshot),
    });

    await expect(service.publishDraft(claimed.id)).rejects.toThrow('configuration-v1');
  });
}

export function registerRejectsStaleEditorSavesInsideTheConfigurationLockIncludingMetadataOnlyChanges(
  scope: WagoServiceTestScope,
): void {
  it('rejects stale editor saves inside the configuration lock, including metadata-only changes', async () => {
    const { service, draftRepository } = scope.createService([{ ...scope.controller(), trustState: 'claimed' }]);
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
}

export function registerReleasesTheClaimConfigurationLockAfterPreparationFails(scope: WagoServiceTestScope): void {
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
    const candidate = { ...scope.controller(), fingerprint: 'fingerprint' };
    const { service, context, controllerRepository, enrollmentRepository } = scope.createService(
      [candidate],
      [enrollment],
    );
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
}

export function registerReplaysOnlyPublishedConfigurationWhenTheLatestRevisionIsS(scope: WagoServiceTestScope): void {
  it.each(['pending', 'rejected', 'published', 'applied'])(
    'replays only published configuration when the latest revision is %s',
    async (state) => {
      const { service, context, revisionRepository } = scope.createService([
        { ...scope.controller(), trustState: 'claimed' },
      ]);
      revisionRepository.find.mockResolvedValue([{ revision: 1, state, snapshot: '{}' }]);
      const image = `sha256:${'a'.repeat(64)}`;
      await service.setRuntimePolicy(1, image, image, 'boot-token');
      expect(context.mqtt.publish).toHaveBeenCalledTimes(['published', 'applied'].includes(state) ? 2 : 1);
    },
  );
}
