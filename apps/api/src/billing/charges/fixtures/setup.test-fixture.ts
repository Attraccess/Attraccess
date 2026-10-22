import { BillingService } from '../billing.service';
import { createBillingServiceFixture } from './service.test-fixture';

export async function resetTestFixture(scope: ReturnType<typeof createBillingServiceFixture>) {
  Object.assign(scope, createBillingServiceFixture());
  scope.service = new BillingService(
    scope.persistence,
    scope.transactionDriver.transactions,
    scope.liveNotificationsService as never,
    { getNodes: jest.fn().mockResolvedValue([]) } as never,
    scope.emailService as never,
    { emit: jest.fn() } as never,
    scope.mockMetricsService as never,
    scope.auditService as never,
  );
}
