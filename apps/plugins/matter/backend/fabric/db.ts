import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import type { EntityManager } from 'typeorm';
import { MatterFabric } from '../devices/entities';

/**
 * Runs `fn` in one database transaction. On the host this goes through the serialized queue (so it is isolated from
 * the core's writes on SQLite); a context without it falls back to a plain transaction.
 */
export function runTransaction<T>(context: PluginContext, fn: (manager: EntityManager) => Promise<T>): Promise<T> {
  if (typeof context.runSerialized === 'function') return context.runSerialized(fn);
  return context.getRepository(MatterFabric).manager.transaction(fn);
}
