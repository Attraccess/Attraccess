import { registerReconciliationInvalidatesPendingChargesAfterAnAcceptedSFreeBaselineEvenIfAnotherBranchFails } from './resource-metering.persistence.reconciliation-invalidates-pending-charges-after-an-accepted-s-free-baseline-even-if-another-branch-fails.test-cases';
import { registerReconciliationKeepsAnOlderChargePendingWhenAFreeStartFailsBeforeAcknowledging } from './resource-metering.persistence.reconciliation-keeps-an-older-charge-pending-when-a-free-start-fails-before-acknowledging.test-cases';
import { registerReconciliationInvalidatesAnOlderPendingChargeWhenTheNextStartUsesOnlyIncrements } from './resource-metering.persistence.reconciliation-invalidates-an-older-pending-charge-when-the-next-start-uses-only-increments.test-cases';
import { registerReconciliationRetryingBillsThePendingEnergyAsASeparateCorrectionExactlyOnceAndLeavesTheBillUntouche } from './resource-metering.persistence.reconciliation-retrying-bills-the-pending-energy-as-a-separate-correction-exactly-once-and-leaves-the-bill-untouche.test-cases';
import { registerReconciliationAppliesTheUsageBillingFactorToALateEnergyChargeLikeEveryOtherItem } from './resource-metering.persistence.reconciliation-applies-the-usage-billing-factor-to-a-late-energy-charge-like-every-other-item.test-cases';
import { registerReconciliationRoundsALargeLateCorrectionExactlyAtTheHalfCreditBoundary } from './resource-metering.persistence.reconciliation-rounds-a-large-late-correction-exactly-at-the-half-credit-boundary.test-cases';
import { registerReconciliationRejectsARetryFirstObservingIdleConsumptionS } from './resource-metering.persistence.reconciliation-rejects-a-retry-first-observing-idle-consumption-s.test-cases';
import { registerReconciliationKeepsTheChargePendingWithTheReasonWhenTheRetryIsStaleOrInvalid } from './resource-metering.persistence.reconciliation-keeps-the-charge-pending-with-the-reason-when-the-retry-is-stale-or-invalid.test-cases';
import { registerReconciliationRefusesToReconcileAfterALaterSessionStartedOnTheMeterAndCanBeWaived } from './resource-metering.persistence.reconciliation-refuses-to-reconcile-after-a-later-session-started-on-the-meter-and-can-be-waived.test-cases';
import { inheritTestScope } from '../../test-utils/inherit-test-scope';
import { UsageLifecycleTestScope } from './resource-metering.persistence.spec';

export function defineReconciliationTests(parentScope: UsageLifecycleTestScope) {
  async function endWithMissingFinal() {
    await parentScope.seedMeter({}, { finalAttempts: 1 });
    await parentScope.start();
    parentScope.onCollect = async () => {
      throw new Error('meter unreachable');
    };
    const ended = await parentScope.end();
    parentScope.onCollect = parentScope.reading('1.5', { observedAt: ended.endTime?.toISOString() });
    return ended;
  }
  const scope = inheritTestScope(
    {
      get parentScope() {
        return parentScope;
      },
      get endWithMissingFinal() {
        return endWithMissingFinal;
      },
      get start() {
        return parentScope.start;
      },
    },
    parentScope,
  );

  registerReconciliationInvalidatesPendingChargesAfterAnAcceptedSFreeBaselineEvenIfAnotherBranchFails(scope);

  registerReconciliationKeepsAnOlderChargePendingWhenAFreeStartFailsBeforeAcknowledging(scope);

  registerReconciliationInvalidatesAnOlderPendingChargeWhenTheNextStartUsesOnlyIncrements(scope);

  registerReconciliationRetryingBillsThePendingEnergyAsASeparateCorrectionExactlyOnceAndLeavesTheBillUntouche(scope);

  registerReconciliationAppliesTheUsageBillingFactorToALateEnergyChargeLikeEveryOtherItem(scope);

  registerReconciliationRoundsALargeLateCorrectionExactlyAtTheHalfCreditBoundary(scope);

  registerReconciliationRejectsARetryFirstObservingIdleConsumptionS(scope);

  registerReconciliationKeepsTheChargePendingWithTheReasonWhenTheRetryIsStaleOrInvalid(scope);

  registerReconciliationRefusesToReconcileAfterALaterSessionStartedOnTheMeterAndCanBeWaived(scope);

  return scope;
}
