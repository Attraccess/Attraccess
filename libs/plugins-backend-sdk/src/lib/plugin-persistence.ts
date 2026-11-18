/**
 * Backend-neutral transaction surface of the plugin SDK.
 *
 * A plugin has no database access. It groups its own storage writes (`context.storage`, see `plugin-storage.ts`) and
 * host port calls (`hostData`, `resourceAccess`) into one atomic unit with {@link PluginPersistenceContext.transaction}
 * and defers effects with `afterCommit`. Nothing here names an engine.
 */

/** The atomic unit of work of one {@link PluginPersistenceContext.transaction} call. */
export interface PluginTransactionScope {
  /** True from the start of the transaction until it committed or rolled back. */
  readonly isOpen: boolean;
  /**
   * Registers work that runs only after the transaction committed (notifications, MQTT publishes, device commands).
   * It never runs on rollback. A failing callback is logged; it neither undoes the commit nor stops later callbacks.
   */
  afterCommit(callback: () => void | Promise<void>): void;
}

/**
 * Transaction capability of a plugin. Requires the PLUGIN_STORAGE permission. The context exposes no connection,
 * repository or query API.
 */
export interface PluginPersistenceContext {
  /**
   * Runs `work` in one atomic, isolated transaction: it commits when `work` resolves and rolls back when it throws.
   * Concurrent transactions (core writes included) never see each other's uncommitted writes, and a check-then-write
   * sequence inside one transaction (an overlap check, then the insert) cannot be raced by another transaction.
   *
   * The host either orders transactions (one runs after the other) or fails one of them with
   * `PluginStorageConflict`, also when the database stays busy at the start or the commit; the failed one is rolled
   * back completely and its `afterCommit` callbacks never run. The host never retries: a caller may retry the whole
   * transaction, which is safe because `work` keeps every external effect in `afterCommit`. How a backend achieves
   * isolation (a single writer, serializable transactions) is not part of the contract.
   *
   * Keep `work` short and limited to database work: no HTTP, MQTT, email or other I/O inside. Register such effects
   * with `scope.afterCommit`; they run only after the commit, in registration order. Do not nest calls: a transaction
   * started inside `work`, or inside a hook the host calls in its own transaction, is refused with
   * `PluginStorageInvalid`; pass the scope down instead. Do not await core services that write (session start and
   * end) inside `work` either.
   */
  transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T>;
}
