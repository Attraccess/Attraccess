/** In-process cancellation for a single controller operation; no persisted ownership. */
export interface CommissioningOperationGuard {
  assertOwned(): Promise<void>;
  readonly signal: AbortSignal;
  readonly deadline: number;
}
