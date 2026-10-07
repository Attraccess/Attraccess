import { registerUsageLifecycleBillsExactly045For15KWhAt030KWhWithoutTouchingTheStartStopFlows } from './resource-metering.persistence.usage-lifecycle-bills-exactly-0-45-for-1-5-k-wh-at-0-30-k-wh-without-touching-the-start-stop-flows.test-cases';
import { registerUsageLifecycleInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAfterTheStopFlowBeforeTheCharg } from './resource-metering.persistence.usage-lifecycle-initializes-the-meter-before-any-start-effect-and-collects-only-after-the-stop-flow-before-the-charg.test-cases';
import { registerUsageLifecycleDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotConfigured } from './resource-metering.persistence.usage-lifecycle-does-not-start-an-unmetered-billed-session-when-the-meter-is-not-configured.test-cases';
import { registerUsageLifecycleDoesNotRunStartEffectsOrLeaveASessionWhenInitializationS } from './resource-metering.persistence.usage-lifecycle-does-not-run-start-effects-or-leave-a-session-when-initialization-s.test-cases';
import { registerUsageLifecycleTimesOutAnInitializationThatNeverAnswers } from './resource-metering.persistence.usage-lifecycle-times-out-an-initialization-that-never-answers.test-cases';
import { registerUsageLifecycleRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFail } from './resource-metering.persistence.usage-lifecycle-removes-the-metering-session-of-a-start-whose-flow-effects-fail.test-cases';
import { registerUsageLifecycleRemovesTheSessionOfAnInterruptedStartDuringRestartRecovery } from './resource-metering.persistence.usage-lifecycle-removes-the-session-of-an-interrupted-start-during-restart-recovery.test-cases';
import { registerUsageLifecycleAllowsUnconfiguredTrackingOnlyMetersWithoutBlockingSessions } from './resource-metering.persistence.usage-lifecycle-allows-unconfigured-tracking-only-meters-without-blocking-sessions.test-cases';
import { registerUsageLifecycleEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIsUnavailableLeavingEnergyPendin } from './resource-metering.persistence.usage-lifecycle-ends-the-usage-and-its-stop-effects-even-when-the-final-reading-is-unavailable-leaving-energy-pendin.test-cases';
import { registerUsageLifecycleSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTreatingItAsMissing } from './resource-metering.persistence.usage-lifecycle-settles-a-verified-zero-consumption-as-a-zero-charge-instead-of-treating-it-as-missing.test-cases';
import { registerUsageLifecycleNeverTurnsSIntoAZeroCharge } from './resource-metering.persistence.usage-lifecycle-never-turns-s-into-a-zero-charge.test-cases';
import { registerUsageLifecycleRejectsACounterThatMovedBackwardsWithinTheSession } from './resource-metering.persistence.usage-lifecycle-rejects-a-counter-that-moved-backwards-within-the-session.test-cases';
import { registerUsageLifecycleCountsALifetimeCounterFromItsBaselineAndNeverMixesItWithEarlierConsumption } from './resource-metering.persistence.usage-lifecycle-counts-a-lifetime-counter-from-its-baseline-and-never-mixes-it-with-earlier-consumption.test-cases';
import { registerUsageLifecycleBillsMigratedFlowConversionsFromTheConvertedCounterBaselineThroughOrdinaryCompletionNode } from './resource-metering.persistence.usage-lifecycle-bills-migrated-flow-conversions-from-the-converted-counter-baseline-through-ordinary-completion-node.test-cases';
import { registerUsageLifecycleRejectsALifetimeCounterThatDroppedBelowItsBaseline } from './resource-metering.persistence.usage-lifecycle-rejects-a-lifetime-counter-that-dropped-below-its-baseline.test-cases';
import { registerUsageLifecycleFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlterTheBill } from './resource-metering.persistence.usage-lifecycle-freezes-the-rate-at-session-start-so-later-rate-changes-do-not-alter-the-bill.test-cases';
import { registerUsageLifecycleChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepeatedStopsHappened } from './resource-metering.persistence.usage-lifecycle-charges-the-same-total-once-however-many-interim-readings-and-repeated-stops-happened.test-cases';
import { createUsageLifecycleFixture } from './resource-metering.persistence.spec.createUsageLifecycleFixture.test-fixture';
import { FlowDefinedMeteringTestScope } from './resource-metering.persistence.spec';
import { defineReconciliationTests } from './resource-metering.persistence.spec.defineReconciliationTests.test-fixture';
import { defineTakeoverTests } from './resource-metering.persistence.spec.defineTakeoverTests.test-fixture';

export function defineUsageLifecycleTests(parentScope: FlowDefinedMeteringTestScope) {
  const scope = createUsageLifecycleFixture(parentScope);

  registerUsageLifecycleBillsExactly045For15KWhAt030KWhWithoutTouchingTheStartStopFlows(scope);

  registerUsageLifecycleInitializesTheMeterBeforeAnyStartEffectAndCollectsOnlyAfterTheStopFlowBeforeTheCharg(scope);

  registerUsageLifecycleDoesNotStartAnUnmeteredBilledSessionWhenTheMeterIsNotConfigured(scope);

  registerUsageLifecycleDoesNotRunStartEffectsOrLeaveASessionWhenInitializationS(scope);

  registerUsageLifecycleTimesOutAnInitializationThatNeverAnswers(scope);

  registerUsageLifecycleRemovesTheMeteringSessionOfAStartWhoseFlowEffectsFail(scope);

  registerUsageLifecycleRemovesTheSessionOfAnInterruptedStartDuringRestartRecovery(scope);

  registerUsageLifecycleAllowsUnconfiguredTrackingOnlyMetersWithoutBlockingSessions(scope);

  registerUsageLifecycleEndsTheUsageAndItsStopEffectsEvenWhenTheFinalReadingIsUnavailableLeavingEnergyPendin(scope);

  registerUsageLifecycleSettlesAVerifiedZeroConsumptionAsAZeroChargeInsteadOfTreatingItAsMissing(scope);

  registerUsageLifecycleNeverTurnsSIntoAZeroCharge(scope);

  registerUsageLifecycleRejectsACounterThatMovedBackwardsWithinTheSession(scope);

  registerUsageLifecycleCountsALifetimeCounterFromItsBaselineAndNeverMixesItWithEarlierConsumption(scope);

  registerUsageLifecycleBillsMigratedFlowConversionsFromTheConvertedCounterBaselineThroughOrdinaryCompletionNode(scope);

  registerUsageLifecycleRejectsALifetimeCounterThatDroppedBelowItsBaseline(scope);

  registerUsageLifecycleFreezesTheRateAtSessionStartSoLaterRateChangesDoNotAlterTheBill(scope);

  registerUsageLifecycleChargesTheSameTotalOnceHoweverManyInterimReadingsAndRepeatedStopsHappened(scope);

  describe('takeover', () => {
    defineTakeoverTests(scope);
  });

  describe('reconciliation', () => {
    defineReconciliationTests(scope);
  });

  return scope;
}
