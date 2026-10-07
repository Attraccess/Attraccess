import { defineBillingServiceTests } from './billing.service.spec.defineBillingServiceTests.test-fixture';
import { defineHandleResourceSessionStartedEventTests } from './billing.service.spec.defineHandleResourceSessionStartedEventTests.test-fixture';
import { defineBillingServiceChargeForResourceUsageTests } from './billing.service.spec.defineBillingServiceChargeForResourceUsageTests.test-fixture';
import { defineUpdateResourceBillingConfigurationTests } from './billing.service.spec.defineUpdateResourceBillingConfigurationTests.test-fixture';
import { defineGetResourceBillingConfigurationTests } from './billing.service.spec.defineGetResourceBillingConfigurationTests.test-fixture';
import { defineCreateManualTransactionTests } from './billing.service.spec.defineCreateManualTransactionTests.test-fixture';
import { defineConfigurationCurrencyTests } from './billing.service.spec.defineConfigurationCurrencyTests.test-fixture';
import { defineHandleResourceUsageStartTests } from './billing.service.spec.defineHandleResourceUsageStartTests.test-fixture';
import { defineGetHistoryTests } from './billing.service.spec.defineGetHistoryTests.test-fixture';
import { defineGetBalanceTests } from './billing.service.spec.defineGetBalanceTests.test-fixture';

describe('BillingService', () => {
  defineBillingServiceTests();
});
export type BillingServiceTestScope = ReturnType<typeof defineBillingServiceTests>;
export type HandleResourceSessionStartedEventTestScope = ReturnType<
  typeof defineHandleResourceSessionStartedEventTests
>;
export type BillingServiceChargeForResourceUsageTestScope = ReturnType<
  typeof defineBillingServiceChargeForResourceUsageTests
>;
export type UpdateResourceBillingConfigurationTestScope = ReturnType<
  typeof defineUpdateResourceBillingConfigurationTests
>;
export type GetResourceBillingConfigurationTestScope = ReturnType<typeof defineGetResourceBillingConfigurationTests>;
export type CreateManualTransactionTestScope = ReturnType<typeof defineCreateManualTransactionTests>;
export type ConfigurationCurrencyTestScope = ReturnType<typeof defineConfigurationCurrencyTests>;
export type HandleResourceUsageStartTestScope = ReturnType<typeof defineHandleResourceUsageStartTests>;
export type GetHistoryTestScope = ReturnType<typeof defineGetHistoryTests>;
export type GetBalanceTestScope = ReturnType<typeof defineGetBalanceTests>;

export { defineBillingServiceTests } from './billing.service.spec.defineBillingServiceTests.test-fixture';
export { defineHandleResourceSessionStartedEventTests } from './billing.service.spec.defineHandleResourceSessionStartedEventTests.test-fixture';
export { defineBillingServiceChargeForResourceUsageTests } from './billing.service.spec.defineBillingServiceChargeForResourceUsageTests.test-fixture';
export { defineUpdateResourceBillingConfigurationTests } from './billing.service.spec.defineUpdateResourceBillingConfigurationTests.test-fixture';
export { defineGetResourceBillingConfigurationTests } from './billing.service.spec.defineGetResourceBillingConfigurationTests.test-fixture';
export { defineCreateManualTransactionTests } from './billing.service.spec.defineCreateManualTransactionTests.test-fixture';
export { defineConfigurationCurrencyTests } from './billing.service.spec.defineConfigurationCurrencyTests.test-fixture';
export { defineHandleResourceUsageStartTests } from './billing.service.spec.defineHandleResourceUsageStartTests.test-fixture';
export { defineGetHistoryTests } from './billing.service.spec.defineGetHistoryTests.test-fixture';
export { defineGetBalanceTests } from './billing.service.spec.defineGetBalanceTests.test-fixture';
