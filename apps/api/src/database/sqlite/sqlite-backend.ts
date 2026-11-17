import { DataSource, DataSourceOptions, DefaultNamingStrategy, getMetadataArgsStorage } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import { resolveDatabasePath } from '../../config/storage-path';
import * as migrations from '../migrations';
import type { MigrationTrack } from '../backend/database-backend';
import type { TypeOrmDatabaseBackend } from '../backend/resolve-database-backend';
import { closeResourceTransactionConnection, onResourceConnection } from './run-serialized-transaction';
import { createDataSource } from './sqlite-connection';
import { sqliteErrorClassifier } from './sqlite-errors';
import {
  createSqlitePluginMigrationEngine,
  createSqlitePluginPersistenceHost,
  sqliteHostTransactionScope,
} from './plugin-storage/sqlite-plugin-storage';
import { readSqlitePermissionOwners } from './sqlite-permission-owners';
import { openSqliteStartupSettings } from './sqlite-startup-settings';
import { createSqliteTransfer } from './sqlite-transfer';
import { createSqliteUnitOfWork } from './sqlite-unit-of-work';

const entityList: unknown[] = Object.values(entities);

const migrationTrack: MigrationTrack = {
  name: 'sqlite',
  tableName: 'migrations',
  directory: 'apps/api/src/database/migrations',
  migrations: Object.values(migrations),
};

/**
 * The tables of the host's own schema. A plugin may not claim one of them for its storage. The names follow
 * TypeORM's table naming, from the entity list the application connection is opened with.
 */
function coreTableNames(): ReadonlySet<string> {
  const targets = new Set<unknown>(entityList);
  const naming = new DefaultNamingStrategy();
  const names = new Set<string>([migrationTrack.tableName]);
  for (const table of getMetadataArgsStorage().tables) {
    if (typeof table.target !== 'function' || !targets.has(table.target)) continue;
    names.add((table.name ?? naming.tableName(table.target.name, undefined)).toLowerCase());
  }
  for (const join of getMetadataArgsStorage().joinTables) {
    if (join.name) names.add(join.name.toLowerCase());
  }
  return names;
}

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
    createPersistenceHost: createSqlitePluginPersistenceHost,
    hostTransactionScope: sqliteHostTransactionScope,
    coreTableNames,
    readPermissionOwners: () => readSqlitePermissionOwners(createDataSourceOptions()),
    openStartupSettings: () => openSqliteStartupSettings(createDataSourceOptions()),
  },
  transfer: createSqliteTransfer(migrationTrack),
  onCompanionConnection: onResourceConnection,
  async shutdown(source: DataSource): Promise<void> {
    await closeResourceTransactionConnection(source);
  },
};
