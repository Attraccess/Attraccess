import type { TransactionScope } from '../database/unit-of-work';

/**
 * Where a resource persistence read or write runs: a unit-of-work scope, so that it sees and joins the caller's
 * open transaction. Code that has not moved to units of work yet may still pass the transaction handle of its
 * engine; the adapters accept both, which keeps callers outside the resource area working while they migrate.
 * Omit it to run on the application connection.
 */
export type ResourcePersistenceContext = TransactionScope | object;
