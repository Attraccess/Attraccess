import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import { resolveDatabasePath } from '../../config/storage-path';
import * as migrations from '../migrations';
import type { DatabaseBackend, MigrationTrack } from '../backend/database-backend';
import { closeResourceTransactionConnection } from './run-serialized-transaction';
import { createDataSource } from './sqlite-connection';
import { sqliteErrorClassifier } from './sqlite-errors';
import { createSqliteTransfer } from './sqlite-transfer';

const entityList: unknown[] = Object.values(entities);

const migrationTrack: MigrationTrack = {
  name: 'sqlite',
  tableName: 'migrations',
  directory: 'apps/api/src/database/migrations',
  migrations: Object.values(migrations),
};

export const sqliteBackend: DatabaseBackend = {
  type: 'sqlite',
  entities: entityList,
  migrationTrack,
  createDataSourceOptions(): DataSourceOptions {
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
  },
  createDataSource,
  errors: sqliteErrorClassifier,
  transfer: createSqliteTransfer(migrationTrack),
  async shutdown(source: DataSource): Promise<void> {
    await closeResourceTransactionConnection(source);
  },
};
