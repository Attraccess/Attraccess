import { BillingService } from '../billing.service';
import { billingOperationsFake, billingTransactionsFake } from './operations.test-fixture';
import { mockMetricsService } from './metrics.test-fixture';

export function createBillingServiceFixture() {
  const persistence = billingOperationsFake();
  return {
    service: undefined as BillingService,
    persistence,
    transactionDriver: billingTransactionsFake(persistence),
    liveNotificationsService: { notifyTransactionUpdate: jest.fn() },
    emailService: { sendBillingTransactionEmail: jest.fn(), sendResourceUsageBillingSummaryEmail: jest.fn() },
    auditService: { recordBillingTransaction: jest.fn(), recordBillingTransactionAfterCommit: jest.fn() },
    mockMetricsService,
  };
}
