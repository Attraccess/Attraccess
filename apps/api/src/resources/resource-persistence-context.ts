import type { TransactionScope } from '../database/unit-of-work';

/**
 * Where a resource persistence read or write runs: a unit-of-work scope, so that it sees and joins the caller's
 * open transaction. Omit it to run on the application connection.
 */
export type ResourcePersistenceContext = TransactionScope;
