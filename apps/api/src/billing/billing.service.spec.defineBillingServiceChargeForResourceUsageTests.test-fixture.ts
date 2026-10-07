import { registerBillingServiceChargeForResourceUsageRejectsRecalculationWhenACompletedTransactionAlreadyExistsForTheUsage } from './billing.service.billing-service-charge-for-resource-usage-rejects-recalculation-when-a-completed-transaction-already-exists-for-the-usage.test-cases';
import { registerBillingServiceChargeForResourceUsageSendsEmailAfterCompletingUsageTransaction } from './billing.service.billing-service-charge-for-resource-usage-sends-email-after-completing-usage-transaction.test-cases';
import { registerBillingServiceChargeForResourceUsageDoesNotPublishAnAbortedOrPendingCharge } from './billing.service.billing-service-charge-for-resource-usage-does-not-publish-an-aborted-or-pending-charge.test-cases';
import { registerBillingServiceChargeForResourceUsageValidatesATentativeStartWithoutCreatingBillingRecords } from './billing.service.billing-service-charge-for-resource-usage-validates-a-tentative-start-without-creating-billing-records.test-cases';
import { registerBillingServiceChargeForResourceUsageDoesNotTurnACommittedLifecycleIntoAFailureWhenChargePublicationFails } from './billing.service.billing-service-charge-for-resource-usage-does-not-turn-a-committed-lifecycle-into-a-failure-when-charge-publication-fails.test-cases';
import { createBillingServiceChargeForResourceUsageFixture } from './billing.service.spec.createBillingServiceChargeForResourceUsageFixture.test-fixture';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineBillingServiceChargeForResourceUsageTests(parentScope: BillingServiceTestScope) {
  const scope = createBillingServiceChargeForResourceUsageFixture(parentScope);
  registerBillingServiceChargeForResourceUsageRejectsRecalculationWhenACompletedTransactionAlreadyExistsForTheUsage(
    scope,
  );

  registerBillingServiceChargeForResourceUsageSendsEmailAfterCompletingUsageTransaction(scope);

  registerBillingServiceChargeForResourceUsageDoesNotPublishAnAbortedOrPendingCharge(scope);

  registerBillingServiceChargeForResourceUsageValidatesATentativeStartWithoutCreatingBillingRecords(scope);

  registerBillingServiceChargeForResourceUsageDoesNotTurnACommittedLifecycleIntoAFailureWhenChargePublicationFails(
    scope,
  );

  return scope;
}
