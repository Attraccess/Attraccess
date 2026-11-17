import { Logger } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { createHostTransactionScope, createSqlitePluginPersistence } from '@attraccess/plugins-backend-sdk/sqlite';
import type { PluginEntityClass, PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import type { PluginPersistenceHost } from '../../plugin-system/persistence/plugin-persistence-host.port';
import { runSerializedTransaction } from './run-serialized-transaction';

const logger = new Logger('PluginPersistence');

/**
 * SQLite plugin persistence. Plugin transactions use the host's serialized write path (the dedicated resource
 * lifecycle connection), so they queue with every core session start and end. `entityRegistry` is the entity list
 * the application connection is opened with.
 */
export function createSqlitePluginPersistenceHost(
  getConnection: () => unknown,
  entityRegistry: unknown[],
): PluginPersistenceHost {
  const connection = () => getConnection() as DataSource;
  return {
    backend: 'sqlite',
    registerEntities(entities: readonly PluginEntityClass[]): number {
      // Mutates the shared entity list in place: it runs at AppModule import time, before the connection is
      // constructed, so the additions are picked up. Deduped because AppModule is imported once but instantiated
      // more than once during bootstrap.
      let added = 0;
      for (const entity of entities) {
        if (!entityRegistry.includes(entity)) {
          entityRegistry.push(entity);
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

/**
 * The scope plugin hooks receive for a transaction the host opened itself (the serialized start transaction of a
 * session). The plugin reads through it with its engine subpath; it cannot commit it or defer work onto it.
 */
export function sqliteHostTransactionScope(transaction: object): PluginTransactionScope {
  return createHostTransactionScope(transaction as EntityManager);
}
