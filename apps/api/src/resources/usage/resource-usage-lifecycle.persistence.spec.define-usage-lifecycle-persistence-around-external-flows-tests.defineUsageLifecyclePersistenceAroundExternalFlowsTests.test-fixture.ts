import { rm } from 'node:fs/promises';
import { closeResourceTransactionConnection } from '../../database/run-serialized-transaction';
import { registerUsageLifecyclePersistenceAroundExternalFlowsRecoversALegacyOrphanOnRestartWithoutLosingFormsOrChangingBillingBillS } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-recovers-a-legacy-orphan-on-restart-without-losing-forms-or-changing-billing-bill-s.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsReconcilesLegacyOrphansBeforeEnforcingOpenStateAndOccupancyConstraints } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-reconciles-legacy-orphans-before-enforcing-open-state-and-occupancy-constraints.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsRetainsDuplicateLegacyRealSessionsAndResolvesThemConsistentlyWithoutCancellingOrCharging } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-retains-duplicate-legacy-real-sessions-and-resolves-them-consistently-without-cancelling-or-charging.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsKeepsValidInFlightStartReservationsProtectedAndNeverQuarantinesThem } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-keeps-valid-in-flight-start-reservations-protected-and-never-quarantines-them.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsNeverRepairsHistoryWithoutItsAuditJournalAndRetainsEvidenceOnDowngrade } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-never-repairs-history-without-its-audit-journal-and-retains-evidence-on-downgrade.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsRollsBackAWrittenRecoveryJournalWhenTheUsageUpdateFailsS } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-rolls-back-a-written-recovery-journal-when-the-usage-update-fails-s.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsPreservesTheCompletePriceContractThroughAStartFlowTakeoverS } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-preserves-the-complete-price-contract-through-a-start-flow-takeover-s.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotStartOrRunPhysicalFlowsIfItsPriceSnapshotCannotBePersisted } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-does-not-start-or-run-physical-flows-if-its-price-snapshot-cannot-be-persisted.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsPublishesNeitherTheSessionNorItsBillIfPendingTransactionCreationFails } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-publishes-neither-the-session-nor-its-bill-if-pending-transaction-creation-fails.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAFailedStartWithoutPublishingItsCandidateFormsOrBillAndKeepsAcceptedOperation } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-aborts-a-failed-start-without-publishing-its-candidate-forms-or-bill-and-keeps-accepted-operation.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheExistingSessionAndChargeUnchangedAfterAFailedStopWhilePreservingOperation } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-keeps-the-existing-session-and-charge-unchanged-after-a-failed-stop-while-preserving-operation.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheOutgoingSessionIntactAndRemovesTheCandidateAfterAFailedTakeover } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-keeps-the-outgoing-session-intact-and-removes-the-candidate-after-a-failed-takeover.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsRejectsSameUserTakeoverWhenTheOutgoingChargeLeavesTooLittleBalanceForReplacement } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-rejects-same-user-takeover-when-the-outgoing-charge-leaves-too-little-balance-for-replacement.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishAPendingStartAfterItsFlowHasTriggeredMaintenance } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-does-not-publish-a-pending-start-after-its-flow-has-triggered-maintenance.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishATentativeStartWhenItsFlowEndsTheSession } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-does-not-publish-a-tentative-start-when-its-flow-ends-the-session.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsKeepsACanceledCandidateReservationUntilItsFlowSettles } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-keeps-a-canceled-candidate-reservation-until-its-flow-settles.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsClaimsACandidateBeforeStoppedFlowEffectsSoConcurrentEndsRunThemOnce } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-claims-a-candidate-before-stopped-flow-effects-so-concurrent-ends-run-them-once.test-cases';
import { registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAnAbandonedTakeoverAtStartupWithoutReplayingFlowsOrDiscardingAcceptedOperation } from './resource-usage-lifecycle.persistence.usage-lifecycle-persistence-around-external-flows-aborts-an-abandoned-takeover-at-startup-without-replaying-flows-or-discarding-accepted-operation.test-cases';
import { resetTestFixture } from './resource-usage-lifecycle.persistence.setup.test-fixture';
import { createUsageLifecyclePersistenceAroundExternalFlowsFixture } from './usage-lifecycle-persistence.state.test-fixture';

export function defineUsageLifecyclePersistenceAroundExternalFlowsTests() {
  const scope = createUsageLifecyclePersistenceAroundExternalFlowsFixture();

  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  afterEach(async () => {
    scope.usage?.onModuleDestroy();
    if (scope.source) {
      await closeResourceTransactionConnection(scope.source);
      if (scope.source.isInitialized) await scope.source.destroy();
    }
    if (scope.directory) await rm(scope.directory, { recursive: true, force: true });
    jest.restoreAllMocks();
  });
  registerUsageLifecyclePersistenceAroundExternalFlowsRecoversALegacyOrphanOnRestartWithoutLosingFormsOrChangingBillingBillS(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsReconcilesLegacyOrphansBeforeEnforcingOpenStateAndOccupancyConstraints(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsRetainsDuplicateLegacyRealSessionsAndResolvesThemConsistentlyWithoutCancellingOrCharging(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsKeepsValidInFlightStartReservationsProtectedAndNeverQuarantinesThem(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsNeverRepairsHistoryWithoutItsAuditJournalAndRetainsEvidenceOnDowngrade(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsRollsBackAWrittenRecoveryJournalWhenTheUsageUpdateFailsS(scope);

  registerUsageLifecyclePersistenceAroundExternalFlowsPreservesTheCompletePriceContractThroughAStartFlowTakeoverS(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotStartOrRunPhysicalFlowsIfItsPriceSnapshotCannotBePersisted(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsPublishesNeitherTheSessionNorItsBillIfPendingTransactionCreationFails(
    scope,
  );
  registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAFailedStartWithoutPublishingItsCandidateFormsOrBillAndKeepsAcceptedOperation(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheExistingSessionAndChargeUnchangedAfterAFailedStopWhilePreservingOperation(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsKeepsTheOutgoingSessionIntactAndRemovesTheCandidateAfterAFailedTakeover(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsRejectsSameUserTakeoverWhenTheOutgoingChargeLeavesTooLittleBalanceForReplacement(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishAPendingStartAfterItsFlowHasTriggeredMaintenance(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsDoesNotPublishATentativeStartWhenItsFlowEndsTheSession(scope);

  registerUsageLifecyclePersistenceAroundExternalFlowsKeepsACanceledCandidateReservationUntilItsFlowSettles(scope);

  registerUsageLifecyclePersistenceAroundExternalFlowsClaimsACandidateBeforeStoppedFlowEffectsSoConcurrentEndsRunThemOnce(
    scope,
  );

  registerUsageLifecyclePersistenceAroundExternalFlowsAbortsAnAbandonedTakeoverAtStartupWithoutReplayingFlowsOrDiscardingAcceptedOperation(
    scope,
  );

  return scope;
}
