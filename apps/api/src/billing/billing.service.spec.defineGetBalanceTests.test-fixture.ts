import { registerGetBalanceReturnsCreditBalanceForExistingUser } from './billing.service.get-balance-returns-credit-balance-for-existing-user.test-cases';
import { registerGetBalanceThrowsWhenUserDoesNotExist } from './billing.service.get-balance-throws-when-user-does-not-exist.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineGetBalanceTests(parentScope: BillingServiceTestScope) {
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
    },
    parentScope,
  );
  registerGetBalanceReturnsCreditBalanceForExistingUser(scope);

  registerGetBalanceThrowsWhenUserDoesNotExist(scope);

  return scope;
}
