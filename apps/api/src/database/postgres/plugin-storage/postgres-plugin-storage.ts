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
import { postgresStorageDdl } from './postgres-storage-ddl';
import { postgresStorageDialect } from './postgres-storage-dialect';
import { PostgresStorageMigrationDriver } from './postgres-storage-migration-driver';
import { createPostgresSessions } from './postgres-storage-sessions';

const logger = new Logger('PluginPersistence');

/**
 * PostgreSQL plugin persistence and storage. A plugin transaction is a real transaction on a pooled connection of the
 * host's DataSource; transactions run concurrently and PostgreSQL isolates them (no per-process queue).
 */
export function createPostgresPluginPersistenceHost(getConnection: () => unknown): PluginPersistenceHost {
  const connection = () => getConnection() as DataSource;
  return {
    createContexts(pluginName: string, storage: CompiledPluginStorage | null) {
      const transactions = createPluginTransactions({
        pluginName,
        runInTransaction: (work) => connection().manager.transaction((manager) => work(manager)),
        onCallbackError: (error) =>
          logger.error(`A post-commit callback of plugin ${pluginName} failed: ${(error as Error)?.message}`),
      });
      const sessions = createPostgresSessions(connection, transactions.isRunning);
      let port: ReturnType<typeof createRecordPort> | undefined;
      const context: PluginStorageContext = {
        open(definition) {
          if (!storage || definition !== (storage.definition as unknown)) {
            throw new PluginStorageInvalid(
              `Plugin "${pluginName}" may only open the storage definition it registered as PluginBackendModule.storage.`,
            );
          }
          port ??= createRecordPort(storage.tables, postgresStorageDialect, sessions);
          return port as never;
        },
      };
      return { persistence: transactions.persistence, storage: Object.freeze(context) };
    },
  };
}

/**
 * The scope plugin hooks receive for a transaction the host opened itself (the unit of work of a session). It is
 * read-only: the plugin reads through it with the record port; writes through it are refused, and it cannot commit
 * it or defer work onto it.
 */
export function postgresHostTransactionScope(unitOfWork: UnitOfWork, scope: TransactionScope): PluginTransactionScope {
  if (!(unitOfWork instanceof ScopedUnitOfWork)) {
    throw new TransactionScopeError('The unit of work is not backed by the PostgreSQL adapter');
  }
  const manager = (unitOfWork as ScopedUnitOfWork<EntityManager>).handleOf(scope);
  return createTransactionScope(
    manager,
    () => scope.isOpen,
    () => {
      throw new PluginStorageInvalid('afterCommit is not available in a transaction owned by the host');
    },
    { readOnly: true },
  );
}

/** The PostgreSQL plugin migration engine. `config` (tests only) replaces the application's connection options. */
export function createPostgresPluginMigrationEngine(
  config: PluginMigrationEngineConfig | null,
  applicationOptions: () => DataSourceOptions,
): PluginMigrationEngine {
  const base = () => (config as DataSourceOptions | null) ?? applicationOptions();
  return new StorageMigrationRunner(new PostgresStorageMigrationDriver(base), postgresStorageDdl);
}
