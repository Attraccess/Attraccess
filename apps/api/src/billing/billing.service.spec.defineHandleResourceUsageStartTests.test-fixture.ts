import { registerHandleResourceUsageStartValidatesTheFrozenFixedFeeAfterPricingChangesDuringAStartFlow } from './billing.service.handle-resource-usage-start-validates-the-frozen-fixed-fee-after-pricing-changes-during-a-start-flow.test-cases';
import { registerHandleResourceUsageStartDoesNotReserveAnOperatingMinuteChargeThatMayNotBeIncurred } from './billing.service.handle-resource-usage-start-does-not-reserve-an-operating-minute-charge-that-may-not-be-incurred.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineHandleResourceUsageStartTests(parentScope: BillingServiceTestScope) {
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get billingTransactionRepository() {
        return parentScope.billingTransactionRepository;
      },
      set billingTransactionRepository(value: typeof parentScope.billingTransactionRepository) {
        parentScope.billingTransactionRepository = value;
      },
    },
    parentScope,
  );
  registerHandleResourceUsageStartValidatesTheFrozenFixedFeeAfterPricingChangesDuringAStartFlow(scope);

  registerHandleResourceUsageStartDoesNotReserveAnOperatingMinuteChargeThatMayNotBeIncurred(scope);

  return scope;
}
