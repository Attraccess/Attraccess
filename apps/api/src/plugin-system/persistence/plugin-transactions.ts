import { AsyncLocalStorage } from 'node:async_hooks';
import type { PluginPersistenceContext, PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import { createTransactionScope } from './plugin-transaction-scope';

export interface PluginTransactionsOptions {
  pluginName: string;
  /**
   * Runs `work` in one transaction of the engine and passes its handle. The host supplies its serialized write path,
   * so plugin transactions queue with every core session start and end.
   */
  runInTransaction<T>(work: (handle: unknown) => Promise<T>): Promise<T>;
  /** Called when a post-commit callback throws. It must not throw. */
  onCallbackError(error: unknown): void;
}

export interface PluginTransactions {
  /** `context.persistence` of the plugin. */
  readonly persistence: PluginPersistenceContext;
  /** Whether the calling async flow runs inside a transaction callback of this plugin. */
  isRunning(): boolean;
}

/**
 * The transaction capability of one plugin, independent of the engine. The engine decides how a transaction runs; this
 * owns the rules the SDK promises: scope lifetime, post-commit callbacks in registration order (after the commit, a
 * failure logged and never undoing it), and no nesting (a transaction started inside a callback would wait for the
 * callback itself on the shared write queue, so it is rejected with an error).
 */
export function createPluginTransactions(options: PluginTransactionsOptions): PluginTransactions {
  const running = new AsyncLocalStorage<{ active: boolean }>();

  async function transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    if (running.getStore()?.active) {
      throw new Error(
        `Plugin "${options.pluginName}" started a transaction inside a transaction callback. Nested calls would ` +
          'deadlock on the shared write queue; pass the callback scope down instead.',
      );
    }
    const callbacks: Array<() => void | Promise<void>> = [];
    let open = true;
    let result: T;
    try {
      result = await options.runInTransaction((handle) => {
        const scope = createTransactionScope(
          handle,
          () => open,
          (callback) => {
            if (!open) throw new Error('Cannot register a post-commit callback on a closed transaction scope');
            callbacks.push(callback);
          },
        );
        const marker = { active: true };
        return running.run(marker, async () => {
          try {
            return await work(scope);
          } finally {
            marker.active = false;
          }
        });
      });
    } finally {
      open = false;
    }
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        options.onCallbackError(error);
      }
    }
    return result;
  }

  return { persistence: { transaction }, isRunning: () => running.getStore()?.active === true };
}
