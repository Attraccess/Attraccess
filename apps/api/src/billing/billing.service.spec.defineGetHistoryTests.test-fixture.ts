import { registerGetHistoryReturnsPaginatedTransactionsAndCallsRepositoryWithCorrectOptions } from './billing.service.get-history-returns-paginated-transactions-and-calls-repository-with-correct-options.test-cases';
import { inheritTestScope } from '../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from './billing.service.spec';

export function defineGetHistoryTests(parentScope: BillingServiceTestScope) {
  const scope = inheritTestScope(
    {
      get billingTransactionRepository() {
        return parentScope.billingTransactionRepository;
      },
      set billingTransactionRepository(value: typeof parentScope.billingTransactionRepository) {
        parentScope.billingTransactionRepository = value;
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
  registerGetHistoryReturnsPaginatedTransactionsAndCallsRepositoryWithCorrectOptions(scope);

  return scope;
}
