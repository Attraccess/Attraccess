import { AsyncLocalStorage } from 'node:async_hooks';
import {
  PluginStorageInvalid,
  type PluginPersistenceContext,
  type PluginTransactionScope,
} from '@attraccess/plugins-backend-sdk';
import { mapStorageError } from '../plugin-storage/storage-errors';
import { createTransactionScope } from './plugin-transaction-scope';

export interface PluginTransactionsOptions {
  pluginName: string;
  /**
   * Runs `work` in one transaction of the engine and passes its handle. Plugin transactions run on their own pooled
   * connection and are not queued behind core session starts and ends.
   */
  runInTransaction<T>(work: (handle: unknown) => Promise<T>): Promise<T>;
  /**
   * Whether the calling flow runs inside a transaction of the host itself (a hook called in the host's unit of
   * work). A transaction started there would wait for that one, so it is refused. Defaults to never.
   */
  insideHostTransaction?(): boolean;
  /** Called when a post-commit callback throws. It must not throw. */
  onCallbackError(error: unknown): void;
}

export interface PluginTransactions {
  /** `context.persistence` of the plugin. */
  readonly persistence: PluginPersistenceContext;
  /** Whether the calling async flow runs inside a transaction callback of this plugin. */
  isRunning(): boolean;
}

/** Why a transaction cannot start in the calling flow, or undefined when it can. */
function startRefusal(options: PluginTransactionsOptions, nested: boolean): string | undefined {
  if (nested) {
    return (
      `Plugin "${options.pluginName}" started a transaction inside a transaction callback. Nested calls would ` +
      'wait for locks the outer transaction holds and take a second connection; pass the callback scope down instead.'
    );
  }
  if (options.insideHostTransaction?.()) {
    return (
      `Plugin "${options.pluginName}" started a transaction inside the host's own transaction (a hook the host ` +
      'calls in it). It would wait for that transaction; hooks read with the scope they are given.'
    );
  }
  return undefined;
}

/** Runs post-commit callbacks in registration order; a failing one is reported and never stops the next. */
async function runCallbacks(callbacks: ReadonlyArray<() => void | Promise<void>>, onError: (error: unknown) => void) {
  for (const callback of callbacks) {
    try {
      await callback();
    } catch (error) {
      onError(error);
    }
  }
}

/**
 * The transaction capability of one plugin, independent of the engine. The engine decides how a transaction runs; this
 * owns the rules the SDK promises: scope lifetime, post-commit callbacks in registration order (after the commit, a
 * failure logged and never undoing it), no nesting (a transaction started inside a callback would wait for the
 * callback itself for locks and a second connection, so it is rejected with an error), and neutral errors at the transaction
 * boundary: a busy database or a serialization failure at BEGIN or COMMIT reaches the plugin as
 * PluginStorageConflict, never as the engine's error. The host does not retry.
 */
export function createPluginTransactions(options: PluginTransactionsOptions): PluginTransactions {
  const running = new AsyncLocalStorage<{ active: boolean }>();

  async function transaction<T>(work: (scope: PluginTransactionScope) => Promise<T>): Promise<T> {
    const refusal = startRefusal(options, running.getStore()?.active === true);
    if (refusal) throw new PluginStorageInvalid(refusal);
    const callbacks: Array<() => void | Promise<void>> = [];
    let open = true;
    let failure: { error: unknown } | undefined;
    let result: T;
    try {
      result = await options.runInTransaction((handle) => {
        const scope = createTransactionScope(
          handle,
          () => open,
          (callback) => {
            if (!open)
              throw new PluginStorageInvalid('Cannot register a post-commit callback on a closed transaction scope');
            callbacks.push(callback);
          },
        );
        const marker = { active: true };
        return running.run(marker, async () => {
          try {
            return await work(scope);
          } catch (error) {
            failure = { error };
            throw error;
          } finally {
            marker.active = false;
          }
        });
      });
    } catch (error) {
      // What `work` threw is the plugin's own outcome; anything else failed at BEGIN or COMMIT.
      throw failure && failure.error === error ? error : mapStorageError(error);
    } finally {
      open = false;
    }
    await runCallbacks(callbacks, options.onCallbackError);
    return result;
  }

  return { persistence: { transaction }, isRunning: () => running.getStore()?.active === true };
}
