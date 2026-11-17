import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { sqlitePersistence, type EntityManager } from '@attraccess/plugins-backend-sdk/sqlite';

/**
 * Runs `fn` in one database transaction. On the host this goes through the serialized queue, so it is isolated from
 * the core's writes on SQLite.
 */
export function runTransaction<T>(context: PluginContext, fn: (manager: EntityManager) => Promise<T>): Promise<T> {
  return sqlitePersistence(context).transaction((manager) => fn(manager));
}
