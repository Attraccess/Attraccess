import { registerBillingServiceFindsOnlyTheOwnerSTransactionIdForAUsageS } from './billing.service.billing-service-finds-only-the-owner-s-transaction-id-for-a-usage-s.test-cases';
import { registerBillingServiceCreatesAnOppositeSignRefundForTransactionAmountS } from './billing.service.billing-service-creates-an-opposite-sign-refund-for-transaction-amount-s.test-cases';
import { registerBillingServiceRejectsAbsentTransactionsAndInvalidRefundAmountsBeforeWriting } from './billing.service.billing-service-rejects-absent-transactions-and-invalid-refund-amounts-before-writing.test-cases';
import { registerBillingServiceShouldBeDefined } from './billing.service.billing-service-should-be-defined.test-cases';
import { resetTestFixture } from './billing.service.setup.test-fixture';
import { createBillingServiceFixture } from './billing.service.spec.createBillingServiceFixture.test-fixture';
import { defineHandleResourceSessionStartedEventTests } from './billing.service.spec.defineHandleResourceSessionStartedEventTests.test-fixture';
import { defineBillingServiceChargeForResourceUsageTests } from './billing.service.spec.defineBillingServiceChargeForResourceUsageTests.test-fixture';
import { defineUpdateResourceBillingConfigurationTests } from './billing.service.spec.defineUpdateResourceBillingConfigurationTests.test-fixture';
import { defineGetResourceBillingConfigurationTests } from './billing.service.spec.defineGetResourceBillingConfigurationTests.test-fixture';
import { defineCreateManualTransactionTests } from './billing.service.spec.defineCreateManualTransactionTests.test-fixture';
import { defineConfigurationCurrencyTests } from './billing.service.spec.defineConfigurationCurrencyTests.test-fixture';
import { defineHandleResourceUsageStartTests } from './billing.service.spec.defineHandleResourceUsageStartTests.test-fixture';
import { defineGetHistoryTests } from './billing.service.spec.defineGetHistoryTests.test-fixture';
import { defineGetBalanceTests } from './billing.service.spec.defineGetBalanceTests.test-fixture';

export function defineBillingServiceTests() {
  const scope = createBillingServiceFixture();
  beforeEach(async () => {
    await resetTestFixture(scope);
  });

  describe('getTransaction', () => {
    it('restricts transaction lookup to its owner', async () => {
      scope.billingTransactionRepository.findOne.mockResolvedValue(null);

      expect(await scope.service.getTransaction(123, 2)).toBeNull();
      expect(scope.billingTransactionRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 123, userId: 2 } }),
      );
    });
  });
  registerBillingServiceFindsOnlyTheOwnerSTransactionIdForAUsageS(scope);

  registerBillingServiceCreatesAnOppositeSignRefundForTransactionAmountS(scope);

  registerBillingServiceRejectsAbsentTransactionsAndInvalidRefundAmountsBeforeWriting(scope);

  registerBillingServiceShouldBeDefined(scope);

  describe('getBalance', () => {
    defineGetBalanceTests(scope);
  });

  describe('getHistory', () => {
    defineGetHistoryTests(scope);
  });

  describe('createManualTransaction', () => {
    defineCreateManualTransactionTests(scope);
  });

  describe('handleResourceSessionStartedEvent', () => {
    defineHandleResourceSessionStartedEventTests(scope);
  });

  describe('getResourceBillingConfiguration', () => {
    defineGetResourceBillingConfigurationTests(scope);
  });

  describe('handleResourceUsageStart', () => {
    defineHandleResourceUsageStartTests(scope);
  });

  describe('updateResourceBillingConfiguration', () => {
    defineUpdateResourceBillingConfigurationTests(scope);
  });

  describe('configuration currency', () => {
    defineConfigurationCurrencyTests(scope);
  });

  describe('BillingService chargeForResourceUsage', () => {
    defineBillingServiceChargeForResourceUsageTests(scope);
  });

  return scope;
}
