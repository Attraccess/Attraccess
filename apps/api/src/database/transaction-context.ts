import type { TransactionScope } from './unit-of-work';

/**
 * The unit of work a caller already holds, passed through application code without looking inside. Only the adapters
 * of a persistence port interpret it (see `adapters/entity-manager-resolver.ts`). `undefined` means "no
 * transaction": the port reads or opens its own.
 */
export type TransactionContext = TransactionScope;
