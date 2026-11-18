import type { PluginPersistenceHost } from '../../../plugin-system/persistence/plugin-persistence-host.port';
import { databaseBackend } from '../../datasource';

/** The plugin persistence host of the active database backend. `getConnection` resolves the host connection lazily. */
export function createPluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  return databaseBackend.plugins.createPersistenceHost(getConnection);
}
