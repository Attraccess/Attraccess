import { registerGenericMetersAttributesSToTheNewestUsageOnlyInitializedS } from './resource-metering.persistence.generic-meters-attributes-s-to-the-newest-usage-only-initialized-s.test-cases';
import { registerGenericMetersRetainsExplicitSLifecycleReportTargetingOverTheNewestPublishedUsage } from './resource-metering.persistence.generic-meters-retains-explicit-s-lifecycle-report-targeting-over-the-newest-published-usage.test-cases';
import { registerGenericMetersExcludesUnpublishedUsagesAndSelectsTheNewestLegacySessionForLiveMetersAndReports } from './resource-metering.persistence.generic-meters-excludes-unpublished-usages-and-selects-the-newest-legacy-session-for-live-meters-and-reports.test-cases';
import { registerGenericMetersPreservesConcurrentConsumptionAndPricingWhenRenamingAMeter } from './resource-metering.persistence.generic-meters-preserves-concurrent-consumption-and-pricing-when-renaming-a-meter.test-cases';
import { registerGenericMetersLoadsOneFlowSnapshotForAllMetersInAStatusPoll } from './resource-metering.persistence.generic-meters-loads-one-flow-snapshot-for-all-meters-in-a-status-poll.test-cases';
import { registerGenericMetersAllowsResourceUsageWhenATrackingOnlyStartFails } from './resource-metering.persistence.generic-meters-allows-resource-usage-when-a-tracking-only-start-fails.test-cases';
import { registerGenericMetersExposesCapturedUnavailableTermsAfterASFreeMeterStart } from './resource-metering.persistence.generic-meters-exposes-captured-unavailable-terms-after-a-s-free-meter-start.test-cases';
import { registerGenericMetersRejectsAnIdleCollectionReplyAfterAnIncrementSessionStarts } from './resource-metering.persistence.generic-meters-rejects-an-idle-collection-reply-after-an-increment-session-starts.test-cases';
import { registerGenericMetersRejectsAnIdleReplyCrossingASFreeMeterStartEndedS } from './resource-metering.persistence.generic-meters-rejects-an-idle-reply-crossing-a-s-free-meter-start-ended-s.test-cases';
import { registerGenericMetersKeepsLifetimePollingAfterASFreeMeterStartModeS } from './resource-metering.persistence.generic-meters-keeps-lifetime-polling-after-a-s-free-meter-start-mode-s.test-cases';
import { registerGenericMetersRejectsALifetimePollThatCrossesTheEndOfASkippedFreeMeterUsage } from './resource-metering.persistence.generic-meters-rejects-a-lifetime-poll-that-crosses-the-end-of-a-skipped-free-meter-usage.test-cases';
import { registerGenericMetersRejectsASessionlessPollDispatchedAfterAMeteringSessionBecameActive } from './resource-metering.persistence.generic-meters-rejects-a-sessionless-poll-dispatched-after-a-metering-session-became-active.test-cases';
import { registerGenericMetersRecordsIncrementsWithoutASessionAndKeepsOtherMetersIndependent } from './resource-metering.persistence.generic-meters-records-increments-without-a-session-and-keeps-other-meters-independent.test-cases';
import { registerGenericMetersRejectsDelayedIdleIncrementsAfterAnIncrementOnlySessionStartsAtRateS } from './resource-metering.persistence.generic-meters-rejects-delayed-idle-increments-after-an-increment-only-session-starts-at-rate-s.test-cases';
import { registerGenericMetersUsesTheFirstCumulativeReadingAsABaselineAndNeverDoubleCountsRepeatedTotals } from './resource-metering.persistence.generic-meters-uses-the-first-cumulative-reading-as-a-baseline-and-never-double-counts-repeated-totals.test-cases';
import { registerGenericMetersBillsMultipleMetersAtCapturedRatesAndNamesWhileIdleIncrementsRemainUnbilled } from './resource-metering.persistence.generic-meters-bills-multiple-meters-at-captured-rates-and-names-while-idle-increments-remain-unbilled.test-cases';
import { registerGenericMetersCountsAlternatingCumulativeReadingsAndIncrementsOnceWhileIdle } from './resource-metering.persistence.generic-meters-counts-alternating-cumulative-readings-and-increments-once-while-idle.test-cases';
import { registerGenericMetersBillsMixedSessionReadingsOnceAndExcludesConsumptionBeforeTheSession } from './resource-metering.persistence.generic-meters-bills-mixed-session-readings-once-and-excludes-consumption-before-the-session.test-cases';
import { registerGenericMetersRejectsMixedPushOnlyDefinitionsWithASReport } from './resource-metering.persistence.generic-meters-rejects-mixed-push-only-definitions-with-a-s-report.test-cases';
import { registerGenericMetersRejectsCumulativeReadingsAfterAnIncrementSessionDefinitionChanges } from './resource-metering.persistence.generic-meters-rejects-cumulative-readings-after-an-increment-session-definition-changes.test-cases';
import { registerGenericMetersKeepsTrackingOnlyMetersLiveDuringSessions } from './resource-metering.persistence.generic-meters-keeps-tracking-only-meters-live-during-sessions.test-cases';
import { registerGenericMetersCarriesPaidFreeZeroAndUnavailableMeterEvidenceFromSettlementIntoTheSReceipt } from './resource-metering.persistence.generic-meters-carries-paid-free-zero-and-unavailable-meter-evidence-from-settlement-into-the-s-receipt.test-cases';
import { registerGenericMetersPeriodicallyCollectsIdleConsumptionWithoutAddingItToTheCompletedBill } from './resource-metering.persistence.generic-meters-periodically-collects-idle-consumption-without-adding-it-to-the-completed-bill.test-cases';
import { registerGenericMetersKeepsAnIncrementSessionBillableAfterItsFlowIsEdited } from './resource-metering.persistence.generic-meters-keeps-an-increment-session-billable-after-its-flow-is-edited.test-cases';
import { registerGenericMetersKeepsRequestedSessionsPendingWhenFlowEditsRemoveFinalCollection } from './resource-metering.persistence.generic-meters-keeps-requested-sessions-pending-when-flow-edits-remove-final-collection.test-cases';
import { registerGenericMetersDoesNotChargeIdleConsumptionWhenAMissingFinalReadingIsRetried } from './resource-metering.persistence.generic-meters-does-not-charge-idle-consumption-when-a-missing-final-reading-is-retried.test-cases';
import { registerGenericMetersRecordsOneIncrementPerFlowNodeExecutionAndRejectsConflictingReplays } from './resource-metering.persistence.generic-meters-records-one-increment-per-flow-node-execution-and-rejects-conflicting-replays.test-cases';
import { registerGenericMetersRejectsConflictingReplayEvidenceJForOrdinaryAndCollectedReadings } from './resource-metering.persistence.generic-meters-rejects-conflicting-replay-evidence-j-for-ordinary-and-collected-readings.test-cases';
import { createGenericMetersFixture } from './resource-metering.persistence.spec.createGenericMetersFixture.test-fixture';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';

export function defineGenericMetersTests(parentScope: FlowDefinedMeteringTestScope) {
  const scope = createGenericMetersFixture(parentScope);

  registerGenericMetersAttributesSToTheNewestUsageOnlyInitializedS(scope);

  registerGenericMetersRetainsExplicitSLifecycleReportTargetingOverTheNewestPublishedUsage(scope);

  registerGenericMetersExcludesUnpublishedUsagesAndSelectsTheNewestLegacySessionForLiveMetersAndReports(scope);

  registerGenericMetersPreservesConcurrentConsumptionAndPricingWhenRenamingAMeter(scope);

  registerGenericMetersLoadsOneFlowSnapshotForAllMetersInAStatusPoll(scope);

  registerGenericMetersAllowsResourceUsageWhenATrackingOnlyStartFails(scope);

  registerGenericMetersExposesCapturedUnavailableTermsAfterASFreeMeterStart(scope);

  registerGenericMetersRejectsAnIdleCollectionReplyAfterAnIncrementSessionStarts(scope);

  registerGenericMetersRejectsAnIdleReplyCrossingASFreeMeterStartEndedS(scope);

  registerGenericMetersKeepsLifetimePollingAfterASFreeMeterStartModeS(scope);

  registerGenericMetersRejectsALifetimePollThatCrossesTheEndOfASkippedFreeMeterUsage(scope);

  registerGenericMetersRejectsASessionlessPollDispatchedAfterAMeteringSessionBecameActive(scope);

  registerGenericMetersRecordsIncrementsWithoutASessionAndKeepsOtherMetersIndependent(scope);

  registerGenericMetersRejectsDelayedIdleIncrementsAfterAnIncrementOnlySessionStartsAtRateS(scope);

  registerGenericMetersUsesTheFirstCumulativeReadingAsABaselineAndNeverDoubleCountsRepeatedTotals(scope);

  registerGenericMetersBillsMultipleMetersAtCapturedRatesAndNamesWhileIdleIncrementsRemainUnbilled(scope);

  registerGenericMetersCountsAlternatingCumulativeReadingsAndIncrementsOnceWhileIdle(scope);

  registerGenericMetersBillsMixedSessionReadingsOnceAndExcludesConsumptionBeforeTheSession(scope);

  registerGenericMetersRejectsMixedPushOnlyDefinitionsWithASReport(scope);

  registerGenericMetersRejectsCumulativeReadingsAfterAnIncrementSessionDefinitionChanges(scope);

  registerGenericMetersKeepsTrackingOnlyMetersLiveDuringSessions(scope);

  registerGenericMetersCarriesPaidFreeZeroAndUnavailableMeterEvidenceFromSettlementIntoTheSReceipt(scope);

  registerGenericMetersPeriodicallyCollectsIdleConsumptionWithoutAddingItToTheCompletedBill(scope);

  registerGenericMetersKeepsAnIncrementSessionBillableAfterItsFlowIsEdited(scope);

  registerGenericMetersKeepsRequestedSessionsPendingWhenFlowEditsRemoveFinalCollection(scope);

  registerGenericMetersDoesNotChargeIdleConsumptionWhenAMissingFinalReadingIsRetried(scope);

  registerGenericMetersRecordsOneIncrementPerFlowNodeExecutionAndRejectsConflictingReplays(scope);

  registerGenericMetersRejectsConflictingReplayEvidenceJForOrdinaryAndCollectedReadings(scope);

  return scope;
}
