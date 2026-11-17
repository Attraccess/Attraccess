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
   * sequence inside one transaction (an overlap check, then the insert) cannot be raced by another transaction: the
   * host either orders the transactions or fails one of them with an error, which rolls it back.
   *
   * Keep `work` short and limited to database work: no HTTP, MQTT, email or other I/O inside. Register such effects
   * with `scope.afterCommit`; they run only after the commit. Do not nest calls: the host rejects a transaction
   * started inside `work` with an error; pass the scope down instead. Do not await core services that write (session
   * start and end) inside `work` either.
   */
  transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T>;
}
