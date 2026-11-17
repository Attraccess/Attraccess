import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import { resolveDatabasePath } from '../../config/storage-path';
import * as migrations from '../migrations';
import type { MigrationTrack } from '../backend/database-backend';
import type { TypeOrmDatabaseBackend } from '../backend/resolve-database-backend';
import { closeResourceTransactionConnection } from './run-serialized-transaction';
import { createDataSource } from './sqlite-connection';
import { sqliteErrorClassifier } from './sqlite-errors';
import { createSqlitePluginMigrationEngine } from './sqlite-plugin-migration-engine';
import { createSqlitePluginPersistenceHost, sqliteHostTransactionScope } from './sqlite-plugin-persistence';
import { createSqliteTransfer } from './sqlite-transfer';
import { createSqliteUnitOfWork } from './sqlite-unit-of-work';

const entityList: unknown[] = Object.values(entities);

const migrationTrack: MigrationTrack = {
  name: 'sqlite',
  tableName: 'migrations',
  directory: 'apps/api/src/database/migrations',
  migrations: Object.values(migrations),
};

function createDataSourceOptions(): DataSourceOptions {
  return {
    synchronize: false,
    migrations: Object.values(migrations),
    migrationsTableName: 'migrations',
    // Providers access database-backed settings while Nest constructs AppModule.
    migrationsRun: true,
    entities: entityList,
    type: 'sqlite',
    database: resolveDatabasePath(),
  } as DataSourceOptions;
}

export const sqliteBackend: TypeOrmDatabaseBackend = {
  type: 'sqlite',
  entities: entityList,
  migrationTrack,
  createDataSourceOptions,
  createDataSource,
  createUnitOfWork: createSqliteUnitOfWork,
  errors: sqliteErrorClassifier,
  plugins: {
    createMigrationEngine: (config) => createSqlitePluginMigrationEngine(config, createDataSourceOptions),
    // The application connection is opened with `entityList`, so plugin entities added to it are mapped.
    createPersistenceHost: (getConnection) => createSqlitePluginPersistenceHost(getConnection, entityList),
    hostTransactionScope: sqliteHostTransactionScope,
  },
  transfer: createSqliteTransfer(migrationTrack),
  async shutdown(source: DataSource): Promise<void> {
    await closeResourceTransactionConnection(source);
  },
};
