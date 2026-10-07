import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { WagoService } from './wago.service';
import { type WagoConfigurationSnapshot } from './configuration';
import type { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import type { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { registerPreviewsAndAppliesLocalPresetsWithoutSavingOrPublishing } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerAuditsPersistentPresetReapplicationUsingSavedEditorProvenance } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerPersistsNamesOnlyOnExplicitSaveAndNeverIncludesThemInPublishedSnapshots } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerIncludesEditorMetadataChangesInReviewsAndRollbackPreviews } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerRestoresHistoricalNamesAndPresetProvenanceWithARollback } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerRequiresForceAcknowledgementForImpactsAndCreatesRollbackAsANewImmutableRevision } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerDoesNotOverwriteTheDraftWhenARollbackRequiresAcknowledgement } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerReturnsFieldValidationErrorsForLocalEditsWithoutChangingTheSavedDraft } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerRejectsPublishingAnotherEditorSReviewedDraftWithAStaleReviewHash } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerRejectsStaleRollbackForceConfirmationBeforeChangingTheDraftOrPublishing } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerClearsNewerEditorProvenanceWhenRollingBackHistoricalMetadataS } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerRejectsAnEarlierReviewAfterAnotherEditorChangesOnlySAndReviewsAgain } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerRequiresAFreshReviewForPreviouslyStoredSnapshotOnlyReviewHashes } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerRequiresCommandAcknowledgementForSPublicationAndRollbackPreview } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerChecksNewlyAddedCommandReferencesAtPublicationNotJustAtReview } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerDoesNotAuthorizeAFailedReviewOrBypassAFailedLookupWithForce } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerHoldsTheConfigurationLockWhileLookingUpReviewImpacts } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerRejectsRollbackAfterAnotherEditorChangesDraftS } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerValidatesHistoricalSnapshotsBeforeReplacingTheSavedDraft } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerRetainsTheReplacementDraftAndPendingRevisionWhenRollbackDeliveryFails } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerComparesSMetadataWhenRetryingPendingPublication } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerBindsForcedPublicationToTheReviewedReferencesIndependentOfQueryOrder } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerRejectsRollbackWhenSChangesAfterPreviewWithoutOverwritingTheDraft } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerRejectsDependenciesAddedDuringRollbackLookupSInsteadOfRefreshingConsent } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerPreservesASavedDraftWhenRollbackControllerCompatibilityFails } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerDoesNotAuditReapplicationOfAnUntouchedPresetWhenAddingAnUnrelatedInput } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerAuditsValidatedForcedPublicationAndRollbackOnceWithTheOriginalRevisionResult } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerRetainsTheAllocatedRevisionForFailedPublicationAndItsRetry } from './wago-configuration.service.requires-a-fresh-review-for-previously-stored-snapshot-only-review-hashes.test-cases';
import { registerAuditsExplicitPresetApplicationAndReapplicationNeverOrdinaryPolicyEditsOrSaveRetries } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerAuditsADeliberateNoChangeReapplicationButNotSavingItsUnchangedProvenanceAgain } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerPersistsAndAuditsAcknowledgementOfExactlyTheReviewedRejectionOnce } from './wago-configuration.service.clears-newer-editor-provenance-when-rolling-back-historical-metadata-s.test-cases';
import { registerRejectsStaleRejectionAcknowledgementAfterSChanges } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerAuditsSuccessfulRollbackWithSourceAndNewlyAllocatedRevisionExactlyOnce } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';
import { registerPreservesVisualNamesWhenThePersistedPresetEndpointChangesAnExistingDraft } from './wago-configuration.service.preserves-visual-names-when-the-persisted-preset-endpoint-changes-an-existing-draft.test-cases';
import { registerAuditsValidatedProfilePersistenceUsingOnlyTheSavedProfileIdentityAndCounts } from './wago-configuration.service.audits-a-deliberate-no-change-reapplication-but-not-saving-its-unchanged-provenance-again.test-cases';

describe('configuration editor service boundaries', () => {
  defineConfigurationEditorServiceBoundariesTests();
});

export function defineConfigurationEditorServiceBoundariesTests() {
  const snapshot: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [{ id: 'point', hardwareProfile: '751-9301', channel: 0 }],
    logicalChannels: [
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'immediate' },
      },
    ],
  };
  function fixture() {
    let draft: WagoConfigurationDraft | null = null;
    const revisions: WagoConfigurationRevision[] = [];
    const drafts = {
      findOneBy: jest.fn(async () => (draft ? { ...draft } : null)),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        draft = { ...value };
        return draft;
      }),
    };
    const revisionRepository = {
      find: jest.fn(async () => [...revisions].sort((a, b) => b.revision - a.revision)),
      findOneBy: jest.fn(async ({ revision }) => revisions.find((item) => item.revision === revision) ?? null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => {
        const index = revisions.findIndex((item) => item.revision === value.revision);
        if (index === -1) revisions.push({ ...value });
        else revisions[index] = { ...value };
        return value;
      }),
    };
    const mqtt = {
      publish: jest.fn<ReturnType<PluginContext['mqtt']['publish']>, Parameters<PluginContext['mqtt']['publish']>>(
        async () => undefined,
      ),
    };
    const flowQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const audit = { record: jest.fn().mockResolvedValue({ status: 'recorded' }) };
    const service = new WagoService({
      mqtt,
      audit,
      logger: { warn: jest.fn() },
      dataSource: { getRepository: () => ({ createQueryBuilder: () => flowQuery }) },
    } as unknown as PluginContext);
    Object.assign(service, {
      controllers: {
        findOneBy: jest.fn(async () => ({
          id: 1,
          hardwareId: 'local-test',
          trustState: 'claimed',
          mqttServerId: 1,
          protocolVersion: '1.0.0',
          capabilities: '["claim","heartbeat","configuration-v1"]',
        })),
      },
      drafts,
      revisions: revisionRepository,
    });
    jest
      .spyOn(service, 'getSettings')
      .mockResolvedValue({ id: 1, defaultMqttServerId: 1, operationalPrefix: 'test/wago' });
    return { service, drafts, mqtt, revisions, flowQuery, audit, draft: () => draft };
  }

  async function rollback(service: WagoService, revision: number, force = false) {
    const preview = await service.previewRevision(1, revision);
    return service.rollback(
      1,
      revision,
      force,
      preview.revision.contentHash,
      preview.current?.contentHash ?? null,
      preview.draftHash,
    );
  }
  const scope = {
    get fixture() {
      return fixture;
    },
    get snapshot() {
      return snapshot;
    },
    get rollback() {
      return rollback;
    },
  };

  registerPreviewsAndAppliesLocalPresetsWithoutSavingOrPublishing(scope);

  registerAuditsPersistentPresetReapplicationUsingSavedEditorProvenance(scope);

  registerPersistsNamesOnlyOnExplicitSaveAndNeverIncludesThemInPublishedSnapshots(scope);

  registerIncludesEditorMetadataChangesInReviewsAndRollbackPreviews(scope);

  registerRestoresHistoricalNamesAndPresetProvenanceWithARollback(scope);

  registerRequiresForceAcknowledgementForImpactsAndCreatesRollbackAsANewImmutableRevision(scope);

  registerDoesNotOverwriteTheDraftWhenARollbackRequiresAcknowledgement(scope);

  registerReturnsFieldValidationErrorsForLocalEditsWithoutChangingTheSavedDraft(scope);

  registerRejectsPublishingAnotherEditorSReviewedDraftWithAStaleReviewHash(scope);

  registerRejectsStaleRollbackForceConfirmationBeforeChangingTheDraftOrPublishing(scope);

  registerClearsNewerEditorProvenanceWhenRollingBackHistoricalMetadataS(scope);

  registerRejectsAnEarlierReviewAfterAnotherEditorChangesOnlySAndReviewsAgain(scope);

  registerRequiresAFreshReviewForPreviouslyStoredSnapshotOnlyReviewHashes(scope);

  registerRequiresCommandAcknowledgementForSPublicationAndRollbackPreview(scope);

  registerChecksNewlyAddedCommandReferencesAtPublicationNotJustAtReview(scope);

  registerDoesNotAuthorizeAFailedReviewOrBypassAFailedLookupWithForce(scope);

  registerHoldsTheConfigurationLockWhileLookingUpReviewImpacts(scope);

  registerRejectsRollbackAfterAnotherEditorChangesDraftS(scope);

  registerValidatesHistoricalSnapshotsBeforeReplacingTheSavedDraft(scope);

  registerRetainsTheReplacementDraftAndPendingRevisionWhenRollbackDeliveryFails(scope);

  registerComparesSMetadataWhenRetryingPendingPublication(scope);
  registerBindsForcedPublicationToTheReviewedReferencesIndependentOfQueryOrder(scope);

  registerRejectsRollbackWhenSChangesAfterPreviewWithoutOverwritingTheDraft(scope);

  registerRejectsDependenciesAddedDuringRollbackLookupSInsteadOfRefreshingConsent(scope);

  registerPreservesASavedDraftWhenRollbackControllerCompatibilityFails(scope);

  registerDoesNotAuditReapplicationOfAnUntouchedPresetWhenAddingAnUnrelatedInput(scope);

  registerAuditsValidatedForcedPublicationAndRollbackOnceWithTheOriginalRevisionResult(scope);

  registerRetainsTheAllocatedRevisionForFailedPublicationAndItsRetry(scope);

  registerAuditsExplicitPresetApplicationAndReapplicationNeverOrdinaryPolicyEditsOrSaveRetries(scope);

  registerAuditsADeliberateNoChangeReapplicationButNotSavingItsUnchangedProvenanceAgain(scope);

  registerPersistsAndAuditsAcknowledgementOfExactlyTheReviewedRejectionOnce(scope);

  registerRejectsStaleRejectionAcknowledgementAfterSChanges(scope);

  registerAuditsSuccessfulRollbackWithSourceAndNewlyAllocatedRevisionExactlyOnce(scope);
  registerPreservesVisualNamesWhenThePersistedPresetEndpointChangesAnExistingDraft(scope);
  registerAuditsValidatedProfilePersistenceUsingOnlyTheSavedProfileIdentityAndCounts(scope);

  return scope;
}

export type ConfigurationEditorServiceBoundariesTestScope = ReturnType<
  typeof defineConfigurationEditorServiceBoundariesTests
>;
