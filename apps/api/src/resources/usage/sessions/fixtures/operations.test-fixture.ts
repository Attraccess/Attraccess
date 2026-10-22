import { ResourceUsageLifecycleAttempt } from '@attraccess/application-models';
import { UsagePersistence, USAGE_OPERATIONS, NewLifecycleAttempt } from '../../persistence/port';
import { operationTransactionsFake } from '../../../../database/testing/operation-transactions.test-fixture';

export function usageOperationsFake(attempts = new Map<string, ResourceUsageLifecycleAttempt>()) {
  // Script successive stored snapshots independently of query shapes.
  const sessionRead = jest.fn();
  const persistence: jest.Mocked<UsagePersistence> = {
    resource: jest.fn(),
    user: jest.fn(),
    activeSession: sessionRead,
    activeSessions: jest.fn().mockResolvedValue([]),
    sessionDetails: sessionRead,
    history: jest.fn(),
    usageWithResourceAndUser: sessionRead,
    usageWithProject: sessionRead,
    usageForProjectUpdate: sessionRead,
    saveUsage: jest.fn(),
    pendingCandidate: sessionRead,
    candidate: sessionRead,
    insertCandidate: jest.fn().mockResolvedValue(undefined),
    deletePendingCandidate: jest.fn().mockResolvedValue(1),
    endActiveUsage: jest.fn().mockResolvedValue(1),
    finalizeUsage: jest.fn().mockResolvedValue(undefined),
    setBillingFactor: jest.fn().mockResolvedValue(undefined),
    setAttributedDuration: jest.fn().mockResolvedValue(undefined),
    attempt: jest.fn(async (id, resourceId) => {
      const attempt = attempts.get(id);
      return attempt?.resourceId === resourceId ? attempt : null;
    }),
    attemptForResource: jest.fn(
      async (id) => [...attempts.values()].find((attempt) => attempt.resourceId === id) ?? null,
    ),
    attempts: jest.fn(async () => [...attempts.values()]),
    saveAttempt: jest.fn(async (data: NewLifecycleAttempt) => {
      const attempt = data as ResourceUsageLifecycleAttempt;
      attempts.set(data.id, attempt);
      return attempt;
    }),
    deleteAttempt: jest.fn(async (id) => {
      attempts.delete(id);
    }),
    clearAttemptCandidate: jest.fn(async (id, resourceId) => {
      const attempt = attempts.get(id);
      if (attempt?.resourceId === resourceId) attempt.candidateUsageId = null;
    }),
    setAttemptBillingItems: jest.fn(async (id, items) => {
      const attempt = attempts.get(id);
      if (attempt) attempt.billingItems = items;
    }),
    pendingUsageExists: jest.fn().mockResolvedValue(false),
    recoveryResourceIds: jest.fn().mockResolvedValue([]),
    recoverOrphans: jest.fn().mockResolvedValue(0),
    meters: jest.fn().mockResolvedValue([]),
  };
  const transactionDriver = operationTransactionsFake();
  transactionDriver.bind(USAGE_OPERATIONS, persistence);
  return { persistence, sessionRead, transactionDriver };
}
