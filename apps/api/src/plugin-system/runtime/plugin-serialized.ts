import type { EntityManager } from 'typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { runSerializedTransaction } from '../../database/run-serialized-transaction';

/** Marks the async context of a running plugin `runSerialized` callback; `active` drops once it settled. */
const runningCallback = new AsyncLocalStorage<{ active: boolean }>();

/**
 * Plugin-facing runSerialized. It shares core's SQLite write queue, so a nested call would queue behind
 * its own caller and never run. Such a call is rejected with a clear error instead of hanging, also when
 * the callback merely schedules it without awaiting. Calls starting after the callback settled are unaffected.
 */
export function createPluginRunSerialized(
  pluginName: string,
  getManager: () => EntityManager,
): <T>(fn: (manager: EntityManager) => Promise<T>) => Promise<T> {
  return async <T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> => {
    if (runningCallback.getStore()?.active) {
      throw new Error(
        `Plugin "${pluginName}" called runSerialized inside a runSerialized callback. Nested calls would deadlock ` +
          'on the shared write queue; pass the callback manager down instead.',
      );
    }
    return runSerializedTransaction(getManager(), (manager) => {
      const marker = { active: true };
      return runningCallback.run(marker, async () => {
        try {
          return await fn(manager);
        } finally {
          marker.active = false;
        }
      });
    });
  };
}
