import type { TransactionScope } from './unit-of-work';

/** An open unit-of-work scope for unit tests whose stores are fakes; it only has to be recognisable by identity. */
export function fakeTransactionScope(): TransactionScope {
  return { isOpen: true, afterCommit: jest.fn() };
}
