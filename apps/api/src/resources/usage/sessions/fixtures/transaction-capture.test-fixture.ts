export interface CapturedTransaction {
  /** The manager this transaction handed to its callback. */
  manager: object;
  /** Audit calls made while this transaction's callback was running. */
  auditCalls: unknown[][];
}

/**
 * Gives every transaction its own manager object (inheriting the shared mock's methods), so a test
 * can prove an audit call received the manager of the transaction it ran in, not any manager.
 */
export function captureTransactions(
  repositoryManager: { transaction: jest.Mock },
  baseManager: object,
  audit: jest.Mock,
): CapturedTransaction[] {
  const transactions: CapturedTransaction[] = [];
  repositoryManager.transaction.mockImplementation(async (work: (manager: object) => Promise<unknown>) => {
    const manager = Object.create(baseManager) as object;
    const firstAuditCall = audit.mock.calls.length;
    try {
      return await work(manager);
    } finally {
      transactions.push({ manager, auditCalls: audit.mock.calls.slice(firstAuditCall) });
    }
  });
  return transactions;
}
