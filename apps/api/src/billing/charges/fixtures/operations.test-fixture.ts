import { BILLING_OPERATIONS, BillingPersistence } from '../../persistence/port';
import { AuditCommitBoundary, AUDIT_COMMIT_BOUNDARY } from '../../../audit/persistence/port';
import { DatabaseTransactions, TransactionDriver } from '../../../database/transaction-scope';

function operation<K extends keyof BillingPersistence>() {
  return jest.fn<ReturnType<BillingPersistence[K]>, Parameters<BillingPersistence[K]>>();
}

export function billingOperationsFake(): jest.Mocked<BillingPersistence> {
  return {
    balance: operation<'balance'>().mockResolvedValue(null),
    transactionIdForUsage: operation<'transactionIdForUsage'>().mockResolvedValue(null),
    history: operation<'history'>().mockResolvedValue([[], 0]),
    transaction: operation<'transaction'>().mockResolvedValue(null),
    completedUsageCharge: operation<'completedUsageCharge'>().mockResolvedValue(null),
    createTransaction: operation<'createTransaction'>().mockImplementation(
      async (data) => ({ id: 999, ...data }) as never,
    ),
    currency: operation<'currency'>().mockResolvedValue(null),
    setCurrency: operation<'setCurrency'>().mockResolvedValue(undefined),
    resourceConfiguration: operation<'resourceConfiguration'>().mockResolvedValue(null),
    saveResourceConfiguration: operation<'saveResourceConfiguration'>().mockImplementation(
      async (data) => data as never,
    ),
    positiveMeterCount: operation<'positiveMeterCount'>().mockResolvedValue(0),
    itemByExternalReference: operation<'itemByExternalReference'>().mockResolvedValue(null),
    itemReferenceExists: operation<'itemReferenceExists'>().mockResolvedValue(false),
    pendingUsageTransaction: operation<'pendingUsageTransaction'>().mockResolvedValue(null),
    matchingPendingItem: operation<'matchingPendingItem'>().mockResolvedValue(null),
    usageTransaction: operation<'usageTransaction'>().mockResolvedValue(null),
    matchingItem: operation<'matchingItem'>().mockResolvedValue(null),
    updateItemQuantity: operation<'updateItemQuantity'>().mockResolvedValue(undefined),
    usageTransactionWithItems: operation<'usageTransactionWithItems'>().mockResolvedValue(null),
    completeTransaction: operation<'completeTransaction'>().mockResolvedValue(undefined),
    saveItem: operation<'saveItem'>().mockResolvedValue(undefined),
    chargeForNotification: operation<'chargeForNotification'>().mockResolvedValue(null),
  };
}

export function billingTransactionsFake(operations: BillingPersistence) {
  const auditBoundary: jest.Mocked<AuditCommitBoundary> = { defer: jest.fn() };
  const driver: TransactionDriver = {
    backend: 'fake',
    run: async (_conflicts, work) =>
      work({
        resolve: (token) => {
          if (token.id === BILLING_OPERATIONS.id) return operations as never;
          if (token.id === AUDIT_COMMIT_BOUNDARY.id) return auditBoundary as never;
          throw new Error(`Unexpected transaction operations: ${token.description}`);
        },
      }),
  };
  const run = jest.spyOn(driver, 'run');
  return {
    run,
    auditBoundary,
    setOperations: (next: BillingPersistence) => {
      operations = next;
    },
    transactions: new DatabaseTransactions(driver),
  };
}
