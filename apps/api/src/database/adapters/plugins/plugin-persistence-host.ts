import type { DataSource } from 'typeorm';
import type { PluginPersistenceHost } from '../../../plugin-system/persistence/plugin-persistence-host.port';
import { databaseBackend } from '../../datasource';
import { unitOfWorkFor } from '../shared-unit-of-work';

/**
 * The plugin persistence host of the active database backend. `getConnection` resolves the host connection lazily;
 * the host also gets the application's unit of work on that connection (the one UNIT_OF_WORK provides), so a plugin
 * hook running in the host's own transaction cannot start a transaction beside it.
 */
export function createPluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  return databaseBackend.plugins.createPersistenceHost(getConnection, () =>
    unitOfWorkFor(getConnection() as DataSource),
  );
}
