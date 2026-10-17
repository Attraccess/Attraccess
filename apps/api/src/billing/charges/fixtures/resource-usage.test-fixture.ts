import { inheritTestScope } from '../../../test-utils/inherit-test-scope';
import { BillingServiceTestScope } from '../billing.service.spec';

export function createBillingServiceChargeForResourceUsageFixture(parentScope: BillingServiceTestScope) {
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
      get billingTransactionItemRepository() {
        return parentScope.billingTransactionItemRepository;
      },
      set billingTransactionItemRepository(value: typeof parentScope.billingTransactionItemRepository) {
        parentScope.billingTransactionItemRepository = value;
      },
      get emailService() {
        return parentScope.emailService;
      },
      set emailService(value: typeof parentScope.emailService) {
        parentScope.emailService = value;
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
  return scope;
}
