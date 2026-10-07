import type { ConfigurationEditorServiceBoundariesTestScope } from './wago-configuration.service.spec';
import { canonicalSnapshot } from './configuration';

export function registerClearsNewerEditorProvenanceWhenRollingBackHistoricalMetadataS(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each([null, undefined, '{}', '{"editor":null}'])(
    'clears newer editor provenance when rolling back historical metadata %s',
    async (historicalMetadata) => {
      const { service, draft, revisions, mqtt } = scope.fixture();
      await service.saveDraft(1, scope.snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      revisions[0].presetProvenance = historicalMetadata;
      const historical = { ...revisions[0] };
      await service.saveDraft(1, scope.snapshot, {
        names: { output: 'Newer name' },
        presets: [{ presetId: 'generic-digital-output', channelId: 'output', physicalPointId: 'point' }],
      });
      const restored = await scope.rollback(service, 1, true);
      expect(JSON.parse(restored.presetProvenance ?? '{}')).toEqual({ editor: { names: {}, presets: [] } });
      expect(draft()?.presetProvenance).toBe(restored.presetProvenance);
      expect(restored.contentHash).toBe(historical.contentHash);
      expect(revisions[0]).toEqual(historical);
      expect(JSON.parse(String(mqtt.publish.mock.calls[1][2])).snapshot).toEqual(scope.snapshot);
    },
  );
}

export function registerComparesSMetadataWhenRetryingPendingPublication(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['names', 'presets', 'unchanged'] as const)(
    'compares %s metadata when retrying pending publication',
    async (change) => {
      const { service, revisions, mqtt } = scope.fixture();
      const metadata = { names: { output: 'Original' }, presets: [] };
      await service.saveDraft(1, scope.snapshot, metadata);
      await service.reviewDraft(1);
      mqtt.publish.mockRejectedValueOnce(new Error('delivery failed'));
      await expect(service.publishDraft(1)).rejects.toThrow('delivery failed');
      const original = { ...revisions[0] };
      const nextMetadata = {
        names: { output: change === 'names' ? 'Renamed' : 'Original' },
        presets:
          change === 'presets'
            ? [{ presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' }]
            : [],
      };
      await service.saveDraft(1, scope.snapshot, nextMetadata);
      await service.reviewDraft(1);
      const published = await service.publishDraft(1);
      expect(published.revision).toBe(change === 'unchanged' ? 1 : 2);
      expect(JSON.parse(published.presetProvenance ?? '{}').editor).toEqual(nextMetadata);
      if (change !== 'unchanged') expect(revisions[0]).toEqual(original);
    },
  );
}

export function registerDoesNotAuditReapplicationOfAnUntouchedPresetWhenAddingAnUnrelatedInput(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('does not audit reapplication of an untouched preset when adding an unrelated input', async () => {
    const { service, audit } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const metadata = {
      names: {},
      presets: [{ presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' }],
    };
    await service.saveDraft(1, scope.snapshot, metadata, principal);
    audit.record.mockClear();
    await service.saveDraft(
      1,
      {
        ...scope.snapshot,
        physicalPoints: [
          ...scope.snapshot.physicalPoints,
          { id: 'input-point', hardwareProfile: '751-9301', channel: 4 },
        ],
        logicalChannels: [
          ...scope.snapshot.logicalChannels,
          {
            id: 'input',
            physicalPointId: 'input-point',
            profile: 'generic-monitored-input',
            capabilities: ['input'],
            disconnectPolicy: { mode: 'hold' },
          },
        ],
      },
      metadata,
      principal,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
}

export function registerDoesNotAuthorizeAFailedReviewOrBypassAFailedLookupWithForce(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('does not authorize a failed review or bypass a failed lookup with force', async () => {
    const { service, draft, drafts, mqtt, flowQuery } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    drafts.save.mockClear();
    flowQuery.getMany.mockRejectedValueOnce(new Error('flow lookup failed'));
    await expect(service.reviewDraft(1)).rejects.toThrow('flow lookup failed');
    expect(draft()?.reviewedHash).toBeNull();
    expect(drafts.save).not.toHaveBeenCalled();
    await expect(service.publishDraft(1, true)).rejects.toThrow('review');
    await service.reviewDraft(1);
    flowQuery.getMany.mockRejectedValueOnce(new Error('flow lookup failed'));
    await expect(service.publishDraft(1, true)).rejects.toThrow('flow lookup failed');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}

export function registerDoesNotOverwriteTheDraftWhenARollbackRequiresAcknowledgement(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('does not overwrite the draft when a rollback requires acknowledgement', async () => {
    const { service, draft } = scope.fixture();
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const before = { ...draft() };
    await expect(scope.rollback(service, 1)).rejects.toThrow('acknowledge');
    expect(draft()).toEqual(before);
  });
}

export function registerHoldsTheConfigurationLockWhileLookingUpReviewImpacts(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('holds the configuration lock while looking up review impacts', async () => {
    const { service, draft, flowQuery } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    let release!: (nodes: never[]) => void;
    let entered!: () => void;
    const lookup = new Promise<void>((resolve) => {
      entered = resolve;
    });
    flowQuery.getMany.mockImplementationOnce(() => {
      entered();
      return new Promise((resolve) => {
        release = resolve;
      });
    });
    const review = service.reviewDraft(1);
    await lookup;
    const save = service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    expect(draft()?.reviewedHash).toBeNull();
    release([]);
    const reviewed = await review;
    await save;
    expect(reviewed.draft.snapshot).toBe(canonicalSnapshot(scope.snapshot));
    expect(draft()?.reviewedHash).toBeNull();
    expect(JSON.parse(draft()?.snapshot ?? '{}').logicalChannels).toEqual([]);
  });
}

export function registerIncludesEditorMetadataChangesInReviewsAndRollbackPreviews(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('includes editor metadata changes in reviews and rollback previews', async () => {
    const { service } = scope.fixture();
    await service.saveDraft(1, scope.snapshot, { names: { output: 'Original' }, presets: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, scope.snapshot, { names: { output: 'Renamed' }, presets: [] });
    const review = await service.reviewDraft(1);

    expect(review.changed).toBe(true);
    expect(review.diff).toEqual([]);
    expect(review.metadataDiff).toEqual([{ path: '$.names.output', previous: 'Original', current: 'Renamed' }]);

    await service.publishDraft(1);
    const preview = await service.previewRevision(1, 1);
    expect(preview.diff).toEqual([]);
    expect(preview.metadataDiff).toEqual([{ path: '$.names.output', previous: 'Renamed', current: 'Original' }]);
  });
}

export function registerPersistsAndAuditsAcknowledgementOfExactlyTheReviewedRejectionOnce(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('persists and audits acknowledgement of exactly the reviewed rejection once', async () => {
    const { service, revisions, audit, mqtt } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    Object.assign(revisions[0], {
      state: 'rejected',
      reportedAt: '2026-01-01T00:00:00.000Z',
      rejectionErrors: '[{"path":"$","message":"invalid"}]',
    });
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const expected = { contentHash: revisions[0].contentHash, reportedAt: revisions[0].reportedAt! };
    mqtt.publish.mockClear();
    const acknowledged = await service.acknowledgeRejection(1, 1, expected, principal);
    expect(acknowledged).toMatchObject({
      state: 'rejected',
      rejectionAcknowledgedBy: 7,
      rejectionAcknowledgedAt: expect.any(String),
    });
    expect(acknowledged.rejectionErrors).toEqual(revisions[0].rejectionErrors);
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.rejection_acknowledgement', 'attempted'],
      ['wago.rejection_acknowledgement', 'succeeded'],
    ]);
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ principal, details: { revision: 1 } }));
    await service.acknowledgeRejection(1, 1, expected, { ...principal, userId: 8 });
    expect(revisions[0].rejectionAcknowledgedBy).toBe(7);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}

export function registerPersistsNamesOnlyOnExplicitSaveAndNeverIncludesThemInPublishedSnapshots(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('persists names only on explicit save and never includes them in published snapshots', async () => {
    const { service, mqtt, draft } = scope.fixture();
    const metadata = { names: { output: 'Machine enable' }, presets: [] };
    await service.saveDraft(1, scope.snapshot, metadata);
    expect(JSON.parse(draft()?.presetProvenance ?? 'null')?.editor).toEqual(metadata);
    expect(draft()?.snapshot).toBe(canonicalSnapshot(scope.snapshot));
    await expect(service.publishDraft(1)).rejects.toThrow('review');
    await service.reviewDraft(1);
    await service.publishDraft(1);
    expect(JSON.parse(String(mqtt.publish.mock.calls[0][2])).snapshot).toEqual(scope.snapshot);
    expect(mqtt.publish.mock.calls[0][2]).not.toContain('Machine enable');
  });
}

export function registerPreservesASavedDraftWhenRollbackControllerCompatibilityFails(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('preserves a saved draft when rollback controller compatibility fails', async () => {
    const { service, mqtt, draft } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    const before = draft();
    const preview = await service.previewRevision(1, 1);
    const controller = {
      id: 1,
      mqttServerId: 1,
      trustState: 'claimed',
      capabilities: '["claim","heartbeat","configuration-v1"]',
    };
    Object.assign(service, {
      controllers: { findOneBy: jest.fn().mockResolvedValue({ ...controller, protocolVersion: '2.0.0' }) },
    });
    mqtt.publish.mockClear();
    await expect(
      service.rollback(
        1,
        1,
        true,
        preview.revision.contentHash,
        preview.current?.contentHash ?? null,
        preview.draftHash,
      ),
    ).rejects.toThrow('Cannot publish configuration');
    expect(draft()).toEqual(before);
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}
