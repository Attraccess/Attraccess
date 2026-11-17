import type {
  PluginEntityClass,
  PluginPersistenceBackend,
  PluginPersistenceContext,
} from '@attraccess/plugins-backend-sdk';

/**
 * What the plugin runtime needs from the active database engine to give a plugin its persistence capabilities.
 * The engine adapter registers the plugin's storage classes, builds the plugin-facing context on the engine's
 * connection and transaction rules.
 */
export interface PluginPersistenceHost {
  readonly backend: PluginPersistenceBackend;
  /**
   * Adds a plugin's storage classes to the host connection's schema description. It must run before the connection
   * opens (module import time). Returns how many classes were new.
   */
  registerEntities(entities: readonly PluginEntityClass[]): number;
  /** The persistence context of one plugin. `entities` are the classes it registered. */
  createContext(pluginName: string, entities: readonly PluginEntityClass[]): PluginPersistenceContext;
}
