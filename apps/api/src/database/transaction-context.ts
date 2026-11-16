/**
 * The transaction a caller already holds, passed through application code without looking inside: a
 * `TransactionScope` of a `UnitOfWork`, or the engine handle of a caller that has not moved to scopes yet. Only
 * the adapters of a persistence port interpret it (see `adapters/entity-manager-resolver.ts`); application code
 * never reads it. `undefined` means "no transaction": the port reads or opens its own.
 */
export type TransactionContext = object;
