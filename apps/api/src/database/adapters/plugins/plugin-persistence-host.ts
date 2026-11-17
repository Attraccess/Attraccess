import { Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { createSqlitePluginPersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import type { PluginEntityClass } from '@attraccess/plugins-backend-sdk';
import type { PluginPersistenceHost } from '../../../plugin-system/persistence/plugin-persistence-host.port';
import type { DatabaseType } from '../../backend/database-backend';
import { dataSourceConfig, databaseBackend } from '../../datasource';
import { runSerializedTransaction } from '../../sqlite/run-serialized-transaction';

const logger = new Logger('PluginPersistence');

/**
 * SQLite plugin persistence. Plugin transactions use the host's serialized write path (the dedicated resource
 * lifecycle connection), so they queue with every core session start and end.
 */
function createSqlitePluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  const connection = () => getConnection() as DataSource;
  return {
    backend: 'sqlite',
    registerEntities(entities: readonly PluginEntityClass[]): number {
      // Mutates the shared entity list in place: it runs at AppModule import time, before the connection is
      // constructed, so the additions are picked up. Deduped because AppModule is imported once but instantiated
      // more than once during bootstrap.
      const registry = dataSourceConfig.entities as unknown[];
      let added = 0;
      for (const entity of entities) {
        if (!registry.includes(entity)) {
          registry.push(entity);
          added++;
        }
      }
      return added;
    },
    createContext(pluginName, entities) {
      return createSqlitePluginPersistence({
        pluginName,
        connection,
        entities,
        runInTransaction: (work) => runSerializedTransaction(connection().manager, work),
        onCallbackError: (error) =>
          logger.error(`A post-commit callback of plugin ${pluginName} failed: ${(error as Error)?.message}`),
      });
    },
  };
}

const HOSTS: Record<DatabaseType, (getConnection: () => unknown) => PluginPersistenceHost> = {
  sqlite: createSqlitePluginPersistenceHost,
};

/** The plugin persistence host of the active database backend. `getConnection` resolves the host connection lazily. */
export function createPluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  return HOSTS[databaseBackend.type](getConnection);
}
