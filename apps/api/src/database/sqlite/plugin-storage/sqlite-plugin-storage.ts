import { Logger } from '@nestjs/common';
import type { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import {
  PluginStorageInvalid,
  type PluginStorageContext,
  type PluginTransactionScope,
} from '@attraccess/plugins-backend-sdk';
import type {
  PluginMigrationEngine,
  PluginMigrationEngineConfig,
} from '../../../plugin-system/persistence/plugin-migration-engine.port';
import type { PluginPersistenceHost } from '../../../plugin-system/persistence/plugin-persistence-host.port';
import { createTransactionScope } from '../../../plugin-system/persistence/plugin-transaction-scope';
import { createPluginTransactions } from '../../../plugin-system/persistence/plugin-transactions';
import { StorageMigrationRunner } from '../../../plugin-system/plugin-storage/storage-migration-runner';
import type { CompiledPluginStorage } from '../../../plugin-system/plugin-storage/storage-model';
import { createRecordPort } from '../../../plugin-system/plugin-storage/storage-records';
import { ScopedUnitOfWork, TransactionScopeError, type TransactionScope, type UnitOfWork } from '../../unit-of-work';
import { runSerializedTransaction } from '../run-serialized-transaction';
import { sqliteStorageDdl } from './sqlite-storage-ddl';
import { sqliteStorageDialect } from './sqlite-storage-dialect';
import { SqliteStorageMigrationDriver } from './sqlite-storage-migration-driver';
import { createSqliteSessions } from './sqlite-storage-sessions';

const logger = new Logger('PluginPersistence');

/**
 * SQLite plugin persistence and storage. Plugin transactions use the host's serialized write path (the dedicated
 * resource lifecycle connection), so they queue with every core session start and end.
 */
export function createSqlitePluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  const connection = () => getConnection() as DataSource;
  return {
    createContexts(pluginName: string, storage: CompiledPluginStorage | null) {
      const transactions = createPluginTransactions({
        pluginName,
        runInTransaction: (work) => runSerializedTransaction(connection().manager, (manager) => work(manager)),
        onCallbackError: (error) =>
          logger.error(`A post-commit callback of plugin ${pluginName} failed: ${(error as Error)?.message}`),
      });
      const sessions = createSqliteSessions(connection, transactions.isRunning);
      let port: ReturnType<typeof createRecordPort> | undefined;
      const context: PluginStorageContext = {
        open(definition) {
          if (!storage || definition !== (storage.definition as unknown)) {
            throw new PluginStorageInvalid(
              `Plugin "${pluginName}" may only open the storage definition it registered as PluginBackendModule.storage.`,
            );
          }
          port ??= createRecordPort(storage.tables, sqliteStorageDialect, sessions);
          return port as never;
        },
      };
      return { persistence: transactions.persistence, storage: Object.freeze(context) };
    },
  };
}

/**
 * The scope plugin hooks receive for a transaction the host opened itself (the serialized start transaction of a
 * session). The plugin reads through it with the record port; it cannot commit it or defer work onto it.
 */
export function sqliteHostTransactionScope(unitOfWork: UnitOfWork, scope: TransactionScope): PluginTransactionScope {
  if (!(unitOfWork instanceof ScopedUnitOfWork)) {
    throw new TransactionScopeError('The unit of work is not backed by the SQLite adapter');
  }
  const manager = (unitOfWork as ScopedUnitOfWork<EntityManager>).handleOf(scope);
  return createTransactionScope(
    manager,
    () => scope.isOpen,
    () => {
      throw new Error('afterCommit is not available in a transaction owned by the host');
    },
  );
}

/** The SQLite plugin migration engine. `config` (tests only) replaces the application's connection options. */
export function createSqlitePluginMigrationEngine(
  config: PluginMigrationEngineConfig | null,
  applicationOptions: () => DataSourceOptions,
): PluginMigrationEngine {
  const base = () => (config as DataSourceOptions | null) ?? applicationOptions();
  return new StorageMigrationRunner(new SqliteStorageMigrationDriver(base), sqliteStorageDdl);
}
