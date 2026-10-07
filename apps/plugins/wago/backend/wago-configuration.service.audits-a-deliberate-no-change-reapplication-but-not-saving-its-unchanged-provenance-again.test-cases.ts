import type { ConfigurationEditorServiceBoundariesTestScope } from './wago-configuration.service.spec';
import type { WagoConfigurationSnapshot } from './configuration';
import { BUILTIN_MODBUS_PROFILES } from '../modbus/model';
import { duplicateProfile } from '../modbus/model';

export function registerAuditsADeliberateNoChangeReapplicationButNotSavingItsUnchangedProvenanceAgain(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits a deliberate no-change reapplication but not saving its unchanged provenance again', async () => {
    const { service, audit } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const application = { presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' };
    await service.saveDraft(1, scope.snapshot, { names: {}, presets: [application] }, principal);
    audit.record.mockClear();
    const metadata = { names: {}, presets: [application, application] };
    await service.saveDraft(1, scope.snapshot, metadata, principal);
    await service.saveDraft(1, scope.snapshot, metadata, principal);
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.preset_reapplication', 'attempted'],
      ['wago.preset_reapplication', 'succeeded'],
    ]);
  });
}

export function registerAuditsExplicitPresetApplicationAndReapplicationNeverOrdinaryPolicyEditsOrSaveRetries(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits explicit preset application and reapplication, never ordinary policy edits or save retries', async () => {
    const { service, audit } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const application = { presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' };
    const metadata = { names: { output: 'Output' }, presets: [application] };
    await service.previewPreset(1, application, scope.snapshot);
    expect(audit.record).not.toHaveBeenCalled();
    await service.saveDraft(1, scope.snapshot, metadata, principal);
    expect(audit.record.mock.calls.map(([event]) => event.action)).toEqual([
      'wago.preset_application',
      'wago.preset_application',
    ]);
    audit.record.mockClear();
    await service.saveDraft(1, scope.snapshot, metadata, principal);
    expect(audit.record).not.toHaveBeenCalled();
    await service.saveDraft(
      1,
      {
        ...scope.snapshot,
        logicalChannels: [{ ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' } }],
      },
      metadata,
      principal,
    );
    expect(audit.record).not.toHaveBeenCalled();
    const edited: WagoConfigurationSnapshot = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' } }],
    };
    const preview = await service.previewPreset(1, application, edited);
    const reapplied = await service.applyPreset(
      1,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
      edited,
    );
    expect(audit.record).not.toHaveBeenCalled();
    // The mounted editor appends one occurrence only when Apply succeeds.
    const reappliedMetadata = { ...metadata, presets: [...metadata.presets, application] };
    await service.saveDraft(1, JSON.parse(reapplied.snapshot), reappliedMetadata, principal);
    expect(audit.record.mock.calls.map(([event]) => event.action)).toEqual([
      'wago.preset_reapplication',
      'wago.preset_reapplication',
    ]);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        details: {
          presetId: 'generic-digital-output',
          channelId: 'output',
          'before.physicalPointCount': 1,
          'before.logicalChannelCount': 1,
          'after.physicalPointCount': 1,
          'after.logicalChannelCount': 1,
        },
      }),
    );
    // Retrying the same save cannot audit the same intent again.
    await service.saveDraft(1, JSON.parse(reapplied.snapshot), reappliedMetadata, principal);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });
}

export function registerAuditsPersistentPresetReapplicationUsingSavedEditorProvenance(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits persistent preset reapplication using saved editor provenance', async () => {
    const { service, audit, draft, mqtt } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const application = { presetId: 'generic-digital-output' as const, channelId: 'output', physicalPointId: 'point' };
    const edited: WagoConfigurationSnapshot = {
      ...scope.snapshot,
      logicalChannels: [{ ...scope.snapshot.logicalChannels[0], disconnectPolicy: { mode: 'hold' } }],
    };
    await service.saveDraft(1, edited, { names: {}, presets: [application] }, principal);
    audit.record.mockClear();
    const preview = await service.previewPreset(1, application);
    await service.applyPreset(
      1,
      application,
      preview.diff.map((change) => change.path),
      preview.draftHash,
      principal,
    );
    expect(JSON.parse(draft()!.snapshot).logicalChannels[0].disconnectPolicy).toEqual({ mode: 'immediate' });
    expect(draft()!.reviewedHash).toBeNull();
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.preset_reapplication', 'attempted'],
      ['wago.preset_reapplication', 'succeeded'],
    ]);
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}

export function registerAuditsSuccessfulRollbackWithSourceAndNewlyAllocatedRevisionExactlyOnce(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits successful rollback with source and newly allocated revision exactly once', async () => {
    const { service, audit, revisions } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    await service.publishDraft(1);
    const preview = await service.previewRevision(1, 1);
    const result = await service.rollback(
      1,
      1,
      true,
      preview.revision.contentHash,
      preview.current?.contentHash ?? null,
      preview.draftHash,
      principal,
    );
    expect(result.revision).toBe(2);
    expect(revisions[0].revision).toBe(1);
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.rollback', 'attempted'],
      ['wago.rollback', 'succeeded'],
    ]);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ details: { sourceRevision: 1, revision: 2 } }),
    );
  });
}

export function registerAuditsValidatedForcedPublicationAndRollbackOnceWithTheOriginalRevisionResult(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits validated forced publication and rollback once with the original revision result', async () => {
    const { service, audit, mqtt } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    await service.saveDraft(1, scope.snapshot);
    await expect(service.publishDraft(1, true, 'stale', principal)).rejects.toThrow('review');
    expect(audit.record).not.toHaveBeenCalled();
    const review = await service.reviewDraft(1);
    const published = await service.publishDraft(1, true, review.draft.reviewedHash!, principal);
    expect(published.revision).toBe(1);
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.forced_publication', 'attempted'],
      ['wago.forced_publication', 'succeeded'],
    ]);
    expect(audit.record).toHaveBeenLastCalledWith(expect.objectContaining({ principal, details: { revision: 1 } }));
    const preview = await service.previewRevision(1, 1);
    audit.record.mockClear();
    mqtt.publish.mockRejectedValueOnce(new Error('transport unavailable'));
    await expect(
      service.rollback(
        1,
        1,
        true,
        preview.revision.contentHash,
        preview.current?.contentHash ?? null,
        preview.draftHash,
        principal,
      ),
    ).rejects.toThrow('transport unavailable');
    expect(audit.record.mock.calls.map(([event]) => [event.action, event.outcome])).toEqual([
      ['wago.rollback', 'attempted'],
      ['wago.rollback', 'failed'],
    ]);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({ details: { sourceRevision: 1, revision: 2 } }),
    );
  });
}

export function registerAuditsValidatedProfilePersistenceUsingOnlyTheSavedProfileIdentityAndCounts(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('audits validated profile persistence using only the saved profile identity and counts', async () => {
    const { service, audit } = scope.fixture();
    const principal = { userId: 7, authenticationMethod: 'session' as const };
    const profile = duplicateProfile(BUILTIN_MODBUS_PROFILES[0], 'custom-profile');
    const candidate = { ...scope.snapshot, modbus: { connections: [], devices: [], profiles: [profile] } };
    await service.saveDraft(1, candidate, undefined, principal);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'wago.profile_creation',
        outcome: 'succeeded',
        details: {
          profileId: 'custom-profile',
          profileVersion: 1,
          'before.physicalPointCount': 0,
          'before.logicalChannelCount': 0,
          'after.physicalPointCount': 1,
          'after.logicalChannelCount': 1,
        },
      }),
    );
    audit.record.mockClear();
    await service.saveDraft(1, candidate, undefined, principal);
    expect(audit.record).not.toHaveBeenCalled();
    profile.measurements[0].scale++;
    await service.saveDraft(1, candidate, undefined, principal);
    expect(audit.record.mock.calls.map(([event]) => event.action)).toEqual([
      'wago.profile_change',
      'wago.profile_change',
    ]);
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('measurements');
  });
}

export function registerBindsForcedPublicationToTheReviewedReferencesIndependentOfQueryOrder(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('binds forced publication to the reviewed references, independent of query order', async () => {
    const { service, flowQuery, mqtt } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    const node = (id: string) => ({
      id,
      resourceId: 2,
      type: 'plugin.wago.command',
      data: { controllerId: 1, channelId: 'output' },
    });
    flowQuery.getMany.mockResolvedValue([node('one')]);
    const review = await service.reviewDraft(1);
    flowQuery.getMany.mockResolvedValue([node('one'), node('two')]);
    await expect(service.publishDraft(1, true, review.draft.reviewedHash!)).rejects.toThrow('review');
    expect(mqtt.publish).not.toHaveBeenCalled();
    const refreshed = await service.reviewDraft(1);
    flowQuery.getMany.mockResolvedValue([node('two'), node('one')]);
    await expect(service.publishDraft(1, true, refreshed.draft.reviewedHash!)).resolves.toMatchObject({ revision: 1 });
  });
}

export function registerChecksNewlyAddedCommandReferencesAtPublicationNotJustAtReview(
  scope: ConfigurationEditorServiceBoundariesTestScope,
): void {
  it('checks newly added command references at publication, not just at review', async () => {
    const { service, mqtt, flowQuery } = scope.fixture();
    await service.saveDraft(1, scope.snapshot);
    await service.reviewDraft(1);
    flowQuery.getMany.mockResolvedValue([
      { id: 'new-command', resourceId: 2, type: 'plugin.wago.command', data: { controllerId: 1, channelId: 'output' } },
    ]);
    await expect(service.publishDraft(1)).rejects.toThrow('review');
    expect(mqtt.publish).not.toHaveBeenCalled();
  });
}
