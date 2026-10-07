import { registerCreateManualTransactionThrowsIfUserDoesNotExist } from './billing.service.create-manual-transaction-throws-if-user-does-not-exist.test-cases';
import { registerCreateManualTransactionSucceedsAndSavesTheTransactionWhenUserExists } from './billing.service.create-manual-transaction-succeeds-and-saves-the-transaction-when-user-exists.test-cases';
import { registerCreateManualTransactionThrowsInsufficientBalanceErrorWhenResultingBalanceWouldBeNegative } from './billing.service.create-manual-transaction-throws-insufficient-balance-error-when-resulting-balance-would-be-negative.test-cases';
import { registerCreateManualTransactionAllowsNegativeChargeWhenBalanceStaysNonNegative } from './billing.service.create-manual-transaction-allows-negative-charge-when-balance-stays-non-negative.test-cases';
import { registerCreateManualTransactionThrowsWhenAmountIsFractional } from './billing.service.create-manual-transaction-throws-when-amount-is-fractional.test-cases';
import { registerCreateManualTransactionAllowsNegativeResultingBalanceWhenFailOnInsufficientBalanceIsFalse } from './billing.service.create-manual-transaction-allows-negative-resulting-balance-when-fail-on-insufficient-balance-is-false.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineCreateManualTransactionTests(parentScope: BillingServiceTestScope) {
  const scope = inheritTestScope(
    {
      get userRepository() {
        return parentScope.userRepository;
      },
      set userRepository(value: typeof parentScope.userRepository) {
        parentScope.userRepository = value;
      },
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
      get liveNotificationsService() {
        return parentScope.liveNotificationsService;
      },
      set liveNotificationsService(value: typeof parentScope.liveNotificationsService) {
        parentScope.liveNotificationsService = value;
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
  registerCreateManualTransactionThrowsIfUserDoesNotExist(scope);

  registerCreateManualTransactionSucceedsAndSavesTheTransactionWhenUserExists(scope);

  registerCreateManualTransactionThrowsInsufficientBalanceErrorWhenResultingBalanceWouldBeNegative(scope);

  registerCreateManualTransactionAllowsNegativeChargeWhenBalanceStaysNonNegative(scope);

  registerCreateManualTransactionThrowsWhenAmountIsFractional(scope);

  registerCreateManualTransactionAllowsNegativeResultingBalanceWhenFailOnInsufficientBalanceIsFalse(scope);

  return scope;
}
