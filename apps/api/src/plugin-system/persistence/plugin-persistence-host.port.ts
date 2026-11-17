import type { PluginPersistenceContext, PluginStorageContext } from '@attraccess/plugins-backend-sdk';
import type { CompiledPluginStorage } from '../plugin-storage/storage-model';

/**
 * What the plugin runtime needs from the active database engine to give a plugin its transaction capability and its
 * record port. The engine adapter builds both on its connection and transaction rules; the plugin never receives the
 * connection, a transaction handle or a statement API.
 */
export interface PluginPersistenceHost {
  /**
   * The contexts of one plugin: `persistence` (transactions) and `storage` (the record port of the tables of its
   * compiled storage declaration; `null` when the plugin declares none, then `open` always throws).
   */
  createContexts(
    pluginName: string,
    storage: CompiledPluginStorage | null,
  ): { persistence: PluginPersistenceContext; storage: PluginStorageContext };
}
