import { configurationHash } from './configuration';
import type { ConfigurationEditorServiceBoundariesTestScope } from './wago-configuration.service.spec';
import type { WagoConfigurationSnapshot } from './configuration';
import { canonicalSnapshot } from './configuration';

export function registerRequiresAFreshReviewForPreviouslyStoredSnapshotOnlyReviewHashes(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('requires a fresh review for previously stored snapshot-only review hashes', async () => {
    const { service, drafts, mqtt } = scope.fixture();
    const saved = await service.saveDraft(1, scope.snapshot);
    await drafts.save({ ...saved, reviewedHash: configurationHash(scope.snapshot) });
    await expect(service.publishDraft(1, true)).rejects.toThrow('review the current');
    expect(mqtt.publish).not.toHaveBeenCalled();
    const review = await service.reviewDraft(1);
    await expect(service.publishDraft(1, true, review.draft.reviewedHash ?? '')).resolves.toMatchObject({
      contentHash: configurationHash(scope.snapshot),
    });
  });
}

export function registerRequiresCommandAcknowledgementForSPublicationAndRollbackPreview(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['unchanged', 'name-only', 'unrelated-input'] as const)(
    'requires command acknowledgement for %s publication and rollback preview',
    async (change) => {
      const { service, mqtt, flowQuery } = scope.fixture();
      await service.saveDraft(1, scope.snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      flowQuery.getMany.mockResolvedValue([
        {
          id: 'command-1',
          resourceId: 2,
          type: 'plugin.wago.command',
          data: { controllerId: 1, channelId: 'output', expectedConfigurationRevision: 1 },
        },
      ]);
      const candidate: WagoConfigurationSnapshot =
        change === 'unrelated-input'
          ? {
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
            }
          : scope.snapshot;
      await service.saveDraft(1, candidate, {
        names: { output: change === 'name-only' ? 'Renamed' : 'Output' },
        presets: [],
      });
      const review = await service.reviewDraft(1);
      expect(review.impacts).toEqual([
        expect.objectContaining({ channelId: 'output', message: expect.stringContaining('Reopen and save') }),
      ]);
      expect((await service.previewRevision(1, 1)).impacts).toEqual(review.impacts);
      await expect(service.publishDraft(1)).rejects.toThrow('acknowledge');
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
      await service.publishDraft(1, true, review.draft.reviewedHash ?? '');
      expect(mqtt.publish).toHaveBeenCalledTimes(2);
    },
  );
}

export function registerRequiresForceAcknowledgementForImpactsAndCreatesRollbackAsANewImmutableRevision(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('requires force acknowledgement for impacts and creates rollback as a new immutable revision', async () => {
    const { service, revisions, mqtt, flowQuery } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const original = { ...revisions[0] };
    flowQuery.getMany.mockResolvedValue([
      { id: 'command-1', resourceId: 2, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'output' } },
    ]);
    const changed = { ...scope.snapshot, logicalChannels: [] };
    await service.saveDraft(1, changed);
    expect((await service.reviewDraft(1)).impacts).toEqual([
      expect.objectContaining({
        channelId: 'output',
        references: [{ nodeId: 'command-1', resourceId: 2, nodeType: 'plugin.wago.command' }],
      }),
    ]);
    await expect(service.publishDraft(1)).rejects.toThrow('acknowledge');
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
    await service.publishDraft(1, true);
    const preview = await service.previewRevision(1, 1);
    expect(preview.revision.revision).toBe(1);
    expect(revisions).toHaveLength(2);
    const restored = await scope.rollback(service, 1, true);
    expect(restored.revision).toBe(3);
    expect(restored.contentHash).toBe(configurationHash(scope.snapshot));
    expect(revisions[0]).toEqual(original);
  });
}

export function registerRestoresHistoricalNamesAndPresetProvenanceWithARollback(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('restores historical names and preset provenance with a rollback', async () => {
    const { service, draft } = scope.fixture();
    const metadata = { names: { output: 'Workshop light', point: 'Cabinet output' }, presets: [] };
    await service.saveDraft(1, scope.snapshot, metadata);
    await service.reviewDraft(1);
    const original = await service.publishDraft(1);
    expect(JSON.parse(original.presetProvenance ?? 'null').editor).toEqual(metadata);
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] }, { names: {}, presets: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1, true);
    const restored = await scope.rollback(service, 1, true);
    expect(restored.presetProvenance).toBe(original.presetProvenance);
    expect(draft()?.presetProvenance).toBe(original.presetProvenance);
  });
}

export function registerRetainsTheAllocatedRevisionForFailedPublicationAndItsRetry(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('retains the allocated revision for failed publication and its retry', async () => {
    const { service, audit, mqtt } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    mqtt.publish.mockRejectedValue(new Error('private transport detail'));
    for (let attempt = 0; attempt < 2; attempt++) {
      await service.reviewDraft(1);
      await expect(service.publishDraft(1, false, undefined, principal)).rejects.toThrow('private transport detail');
      expect(audit.record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          action: 'wago.publication',
          outcome: 'failed',
          details: { revision: 1 },
        }),
      );
    }
    expect(audit.record.mock.calls.map(([event]) => event.outcome)).toEqual([
      'attempted',
      'failed',
      'attempted',
      'failed',
    ]);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('private transport detail');
  });
}

export function registerRetainsTheReplacementDraftAndPendingRevisionWhenRollbackDeliveryFails(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('retains the replacement draft and pending revision when rollback delivery fails', async () => {
    const { service, draft, revisions, mqtt } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    mqtt.publish.mockRejectedValueOnce(new Error('delivery failed'));
    await expect(scope.rollback(service, 1, true)).rejects.toThrow('delivery failed');
    expect(draft()?.snapshot).toBe(canonicalSnapshot(scope.snapshot));
    expect(revisions[1]).toMatchObject({ revision: 2, state: 'pending', snapshot: canonicalSnapshot(scope.snapshot) });
  });
}

export function registerReturnsFieldValidationErrorsForLocalEditsWithoutChangingTheSavedDraft(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('returns field validation errors for local edits without changing the saved draft', async () => {
    const { service, drafts } = scope.fixture();
    const result = await service.validateDraft(1, { ...scope.snapshot, physicalPoints: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(expect.objectContaining({ path: 'logicalChannels[0].physicalPointId' }));
    expect(drafts.save).not.toHaveBeenCalled();
  });
}

export function registerValidatesHistoricalSnapshotsBeforeReplacingTheSavedDraft(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('validates historical snapshots before replacing the saved draft', async () => {
    const { service, draft, revisions, mqtt } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const historical = { ...scope.snapshot, physicalPoints: [{ ...scope.snapshot.physicalPoints[0], channel: 12 }] };
    revisions[0].snapshot = canonicalSnapshot(historical);
    revisions[0].contentHash = configurationHash(historical);
    const before = { ...draft() };
    await expect(scope.rollback(service, 1, true)).rejects.toThrow('rollback configuration is invalid');
    expect(draft()).toEqual(before);
    expect(mqtt.publish).toHaveBeenCalledTimes(1);
  });
}
