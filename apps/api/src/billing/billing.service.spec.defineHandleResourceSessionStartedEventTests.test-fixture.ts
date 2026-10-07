import { registerHandleResourceSessionStartedEventChargesTheCompleteStartTimeContractCreditsPerUsageFixedBillingFactor } from './billing.service.handle-resource-session-started-event-charges-the-complete-start-time-contract-credits-per-usage-fixed-billing-factor.test-cases';
import { registerHandleResourceSessionStartedEventSettlesChargeCreditsAtFactorWithoutFloatingPointRoundingErrors } from './billing.service.handle-resource-session-started-event-settles-charge-credits-at-factor-without-floating-point-rounding-errors.test-cases';
import { registerHandleResourceSessionStartedEventBillsAndRecordsExactDurationDurationMsMsIndependentlyForBothComponents } from './billing.service.handle-resource-session-started-event-bills-and-records-exact-duration-duration-ms-ms-independently-for-both-components.test-cases';
import { registerHandleResourceSessionStartedEventProcessesNonUsageActionsWithoutCreatingATransactionWhenCreditsAreZero } from './billing.service.handle-resource-session-started-event-processes-non-usage-actions-without-creating-a-transaction-when-credits-are-zero.test-cases';
import { registerHandleResourceSessionStartedEventProcessesNotEndedSessionWithoutCreatingATransactionWhenCreditsAreZero } from './billing.service.handle-resource-session-started-event-processes-not-ended-session-without-creating-a-transaction-when-credits-are-zero.test-cases';
import { registerHandleResourceSessionStartedEventDoesNothingWhenComputedCreditsAreZero } from './billing.service.handle-resource-session-started-event-does-nothing-when-computed-credits-are-zero.test-cases';
import { registerHandleResourceSessionStartedEventCreatesANegativeBillingTransactionWhenCredits0 } from './billing.service.handle-resource-session-started-event-creates-a-negative-billing-transaction-when-credits-0.test-cases';
import { registerHandleResourceSessionStartedEventAppliesBillingFactor100DiscountAndCreatesBillingFactorItem } from './billing.service.handle-resource-session-started-event-applies-billing-factor-100-discount-and-creates-billing-factor-item.test-cases';
import { registerHandleResourceSessionStartedEventDoesNotCreateBillingFactorItemWhenBillingFactorIs100 } from './billing.service.handle-resource-session-started-event-does-not-create-billing-factor-item-when-billing-factor-is-100.test-cases';
import { registerHandleResourceSessionStartedEventAppliesBillingFactor100SurchargeAndCreatesPositiveBillingFactorItem } from './billing.service.handle-resource-session-started-event-applies-billing-factor-100-surcharge-and-creates-positive-billing-factor-item.test-cases';
import { registerHandleResourceSessionStartedEventCreatesZeroAmountTransactionWhenBillingFactorIs0AndInsertsANegativeBillingFactorItem } from './billing.service.handle-resource-session-started-event-creates-zero-amount-transaction-when-billing-factor-is-0-and-inserts-a-negative-billing-factor-item.test-cases';
import { registerHandleResourceSessionStartedEventIncludesExistingTransactionItemsInTotalAndUpdatesExistingTransaction } from './billing.service.handle-resource-session-started-event-includes-existing-transaction-items-in-total-and-updates-existing-transaction.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineHandleResourceSessionStartedEventTests(parentScope: BillingServiceTestScope) {
  const createMockManager = () => {
    return {
      findOneBy: jest.fn().mockResolvedValue(null),
      findOne: jest.fn(async () => null),
      getRepository: jest.fn(() => ({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn((data: unknown) => data),
        save: jest.fn(async (data: unknown) => data),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      save: jest.fn(async (_entity: unknown, data: any) => ({ id: 999, ...data })),
      update: jest.fn(async () => undefined),
    } as unknown as {
      findOneBy: jest.Mock;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findOne: jest.Mock<any, any>;
      getRepository: jest.Mock;
      save: jest.Mock;
      update: jest.Mock;
    };
  };
  const scope = inheritTestScope(
    {
      get service() {
        return parentScope.service;
      },
      set service(value: typeof parentScope.service) {
        parentScope.service = value;
      },
      get createMockManager() {
        return createMockManager;
      },
      get billingTransactionRepository() {
        return parentScope.billingTransactionRepository;
      },
      set billingTransactionRepository(value: typeof parentScope.billingTransactionRepository) {
        parentScope.billingTransactionRepository = value;
      },
      get liveNotificationsService() {
        return parentScope.liveNotificationsService;
      },
      set liveNotificationsService(value: typeof parentScope.liveNotificationsService) {
        parentScope.liveNotificationsService = value;
      },
      get emailService() {
        return parentScope.emailService;
      },
      set emailService(value: typeof parentScope.emailService) {
        parentScope.emailService = value;
      },
      get auditService() {
        return parentScope.auditService;
      },
      set auditService(value: typeof parentScope.auditService) {
        parentScope.auditService = value;
      },
    },
    parentScope,
  );

  registerHandleResourceSessionStartedEventChargesTheCompleteStartTimeContractCreditsPerUsageFixedBillingFactor(scope);

  registerHandleResourceSessionStartedEventSettlesChargeCreditsAtFactorWithoutFloatingPointRoundingErrors(scope);

  registerHandleResourceSessionStartedEventBillsAndRecordsExactDurationDurationMsMsIndependentlyForBothComponents(
    scope,
  );

  registerHandleResourceSessionStartedEventProcessesNonUsageActionsWithoutCreatingATransactionWhenCreditsAreZero(scope);

  registerHandleResourceSessionStartedEventProcessesNotEndedSessionWithoutCreatingATransactionWhenCreditsAreZero(scope);

  registerHandleResourceSessionStartedEventDoesNothingWhenComputedCreditsAreZero(scope);

  registerHandleResourceSessionStartedEventCreatesANegativeBillingTransactionWhenCredits0(scope);

  registerHandleResourceSessionStartedEventAppliesBillingFactor100DiscountAndCreatesBillingFactorItem(scope);

  registerHandleResourceSessionStartedEventDoesNotCreateBillingFactorItemWhenBillingFactorIs100(scope);

  registerHandleResourceSessionStartedEventAppliesBillingFactor100SurchargeAndCreatesPositiveBillingFactorItem(scope);

  registerHandleResourceSessionStartedEventCreatesZeroAmountTransactionWhenBillingFactorIs0AndInsertsANegativeBillingFactorItem(
    scope,
  );

  registerHandleResourceSessionStartedEventIncludesExistingTransactionItemsInTotalAndUpdatesExistingTransaction(scope);

  return scope;
}
