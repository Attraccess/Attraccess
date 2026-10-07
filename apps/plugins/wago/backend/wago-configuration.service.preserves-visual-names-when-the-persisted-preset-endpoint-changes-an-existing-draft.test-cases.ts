import type { ConfigurationEditorServiceBoundariesTestScope } from './wago-configuration.service.spec';
import { configurationHash } from './configuration';

export function registerPreservesVisualNamesWhenThePersistedPresetEndpointChangesAnExistingDraft(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('preserves visual names when the persisted preset endpoint changes an existing draft', async () => {
    const { service, draft } = scope.fixture();
    await service.saveDraft(1, scope.snapshot, { names: { output: 'Named output' }, presets: [] });
    const application = { presetId: 'pulsed-lock-bank' as const, channelId: 'output', physicalPointId: 'point' };
    const preview = await service.previewPreset(1, application);
    await service.applyPreset(
      1,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
    );
    expect(JSON.parse(draft()!.presetProvenance!).editor).toEqual({
      names: { output: 'Named output' },
      presets: [application],
    });
  });
}

export function registerPreviewsAndAppliesLocalPresetsWithoutSavingOrPublishing(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('previews and applies local presets without saving or publishing', async () => {
    const { service, drafts, mqtt } = scope.fixture();
    const application = { presetId: 'pulsed-lock-bank' as const, channelId: 'output', physicalPointId: 'point' };
    const preview = await service.previewPreset(1, application, scope.snapshot);
    const result = await service.applyPreset(
      1,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
      scope.snapshot,
    );
    expect(JSON.parse(result.snapshot).logicalChannels[0].pulse.durationMs).toBe(500);
    expect(drafts.save).not.toHaveBeenCalled();
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}

export function registerRejectsAnEarlierReviewAfterAnotherEditorChangesOnlySAndReviewsAgain(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['names', 'presets'] as const)(
    'rejects an earlier review after another editor changes only %s and reviews again',
    async (change) => {
      const { service, draft, mqtt } = scope.fixture();
      await service.saveDraft(1, scope.snapshot, { names: { output: 'Original' }, presets: [] });
      const first = await service.reviewDraft(1);
      const metadata = {
        names: { output: change === 'names' ? 'Renamed' : 'Original' },
        presets:
          change === 'presets'
            ? [{ presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' }]
            : [],
      };
      await service.saveDraft(1, scope.snapshot, metadata);
      const second = await service.reviewDraft(1);
      expect(second.draft.snapshot).toBe(first.draft.snapshot);
      expect(second.draft.reviewedHash).not.toBe(first.draft.reviewedHash);
      expect(second.draft.reviewedHash).toBe(draft()?.reviewedHash);
      await expect(service.publishDraft(1, true, first.draft.reviewedHash ?? '')).rejects.toThrow('draft changed');
      expect(mqtt.publish).not.toHaveBeenCalled();
      const published = await service.publishDraft(1, true, second.draft.reviewedHash ?? '');
      expect(published.contentHash).toBe(configurationHash(scope.snapshot));
      expect(published.contentHash).not.toBe(second.draft.reviewedHash);
      expect(JSON.parse(published.presetProvenance ?? '{}').editor).toEqual(metadata);
      expect(JSON.parse(String(mqtt.publish.mock.calls[0][2]))).toMatchObject({
        contentHash: configurationHash(scope.snapshot),
        snapshot: scope.snapshot,
      });
    },
  );
}

export function registerRejectsDependenciesAddedDuringRollbackLookupSInsteadOfRefreshingConsent(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each([2, 3])(
    'rejects dependencies added during rollback lookup %s instead of refreshing consent',
    async (changedLookup) => {
      const { service, flowQuery, mqtt, draft } = scope.fixture();
      await service.saveDraft(1, scope.snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const node = (id: string) => ({
        id,
        resourceId: 2,
        type: 'plugin.wago.command',
        data: { controllerId: 1, channelId: 'output' },
      });
      flowQuery.getMany.mockResolvedValue([node('a')]);
      const preview = await service.previewRevision(1, 1);
      const before = draft();
      let lookups = 0;
      flowQuery.getMany.mockImplementation(async () =>
        ++lookups >= changedLookup ? [node('a'), node('b')] : [node('a')],
      );
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
      ).rejects.toThrow(/preview|review/);
      expect(mqtt.publish).not.toHaveBeenCalled();
      expect(draft()).toEqual(before);
    },
  );
}

export function registerRejectsPublishingAnotherEditorSReviewedDraftWithAStaleReviewHash(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('rejects publishing another editor’s reviewed draft with a stale review hash', async () => {
    const { service, mqtt } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    const review = await service.reviewDraft(1);
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    expect(review.draft.reviewedHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(service.publishDraft(1, true, review.draft.reviewedHash ?? '')).rejects.toThrow('draft changed');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}

export function registerRejectsRollbackAfterAnotherEditorChangesDraftS(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['snapshot', 'metadata'] as const)(
    'rejects rollback after another editor changes draft %s',
    async (change) => {
      const { service, draft, mqtt } = scope.fixture();
      await service.saveDraft(1, scope.snapshot, { names: { output: 'Original' }, presets: [] });
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const preview = await service.previewRevision(1, 1);
      await service.saveDraft(1, change === 'snapshot' ? { ...scope.snapshot, logicalChannels: [] } : scope.snapshot, {
        names: { output: change === 'metadata' ? 'Another editor' : 'Original' },
        presets: [],
      });
      const before = { ...draft() };
      await expect(
        service.rollback(
          1,
          1,
          true,
          preview.revision.contentHash,
          preview.current?.contentHash ?? null,
          preview.draftHash,
        ),
      ).rejects.toThrow('configuration changed');
      expect(draft()).toEqual(before);
      expect(mqtt.publish).toHaveBeenCalledTimes(1);
      await expect(
        service.rollback(1, 1, true, preview.revision.contentHash, preview.current?.contentHash ?? null),
      ).rejects.toThrow('configuration changed');
    },
  );
}

export function registerRejectsRollbackWhenSChangesAfterPreviewWithoutOverwritingTheDraft(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['current revision', 'current metadata', 'source metadata', 'impact set'])(
    'rejects rollback when %s changes after preview without overwriting the draft',
    async (change) => {
      const { service, revisions, flowQuery, drafts, mqtt, draft } = scope.fixture();
      await service.saveDraft(1, scope.snapshot);
      await service.reviewDraft(1);
      await service.publishDraft(1);
      const preview = await service.previewRevision(1, 1);
      const before = draft();
      if (change === 'current revision') revisions.push({ ...revisions[0], revision: 2 });
      else if (change === 'current metadata')
        revisions.push({
          ...revisions[0],
          revision: 2,
          presetProvenance: JSON.stringify({ editor: { names: { output: 'Renamed' }, presets: [] } }),
        });
      else if (change === 'source metadata')
        revisions[0].presetProvenance = JSON.stringify({ editor: { names: { output: 'Source name' }, presets: [] } });
      else
        flowQuery.getMany.mockResolvedValue([
          { id: 'new', resourceId: 2, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'output' } },
        ]);
      drafts.save.mockClear();
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
      ).rejects.toThrow('preview');
      expect(drafts.save).not.toHaveBeenCalled();
      expect(mqtt.publish).not.toHaveBeenCalled();
      expect(draft()).toEqual(before);
    },
  );
}

export function registerRejectsStaleRejectionAcknowledgementAfterSChanges(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it.each(['state', 'hash', 'report'])('rejects stale rejection acknowledgement after %s changes', async (change) => {
    const { service, revisions, audit } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    Object.assign(revisions[0], { state: 'rejected', reportedAt: '2026-01-01T00:00:00.000Z' });
    const expected = { contentHash: revisions[0].contentHash, reportedAt: revisions[0].reportedAt! };
    if (change === 'state') revisions[0].state = 'applied';
    if (change === 'hash') expected.contentHash = 'stale';
    if (change === 'report') expected.reportedAt = 'stale';
    await expect(
      service.acknowledgeRejection(1, 1, expected, { userId: 7, authenticationMethod: 'session' }),
    ).rejects.toThrow('rejection changed');
    expect(revisions[0].rejectionAcknowledgedAt).toBeUndefined();
    expect(audit.record).not.toHaveBeenCalled();
  });
}

export function registerRejectsStaleRollbackForceConfirmationBeforeChangingTheDraftOrPublishing(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('rejects stale rollback force confirmation before changing the draft or publishing', async () => {
    const { service, mqtt, draft } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const preview = await service.previewRevision(1, 1);
    await service.saveDraft(1, { ...scope.snapshot, logicalChannels: [] });
    await service.reviewDraft(1);
    await service.publishDraft(1, true);
    const before = { ...draft() };
    await expect(
      service.rollback(
        1,
        1,
        true,
        preview.revision.contentHash,
        preview.current?.contentHash ?? null,
        preview.draftHash,
      ),
    ).rejects.toThrow('configuration changed');
    expect(draft()).toEqual(before);
    expect(mqtt.publish).toHaveBeenCalledTimes(2);
    await expect(
      service.rollback(
        1,
        1,
        true,
        'wrong-source',
        configurationHash({ ...scope.snapshot, logicalChannels: [] }),
        preview.draftHash,
      ),
    ).rejects.toThrow('configuration changed');
  });
}
