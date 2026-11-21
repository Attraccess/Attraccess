import 'pg';
import { DataSource, DataSourceOptions, DefaultNamingStrategy, EntityManager, getMetadataArgsStorage } from 'typeorm';
import { entities } from '@attraccess/database-entities';
import type { MigrationTrack } from '../backend/database-backend';
import type { TypeOrmDatabaseBackend } from '../backend/resolve-database-backend';
import { postgresMigrations } from './migrations';
import { PostgresBaseline1760000000000 } from './migrations/1760000000000-baseline';
import { parsePostgresConfig, type PostgresConfig } from './postgres-config';
import { postgresConnectionOptions, createDataSource } from './postgres-connection';
import { postgresErrorClassifier } from './postgres-errors';
import { readPostgresPermissionOwners, openPostgresStartupSettings } from './postgres-startup-reads';
import { createPostgresTransfer } from './postgres-transfer';
import { createPostgresUnitOfWork } from './postgres-unit-of-work';
import {
  createPostgresPluginMigrationEngine,
  createPostgresPluginPersistenceHost,
  postgresHostTransactionScope,
} from './plugin-storage/postgres-plugin-storage';

const entityList: unknown[] = Object.values(entities);

export const POSTGRES_MIGRATIONS_TABLE = 'migrations';

export const postgresMigrationTrack: MigrationTrack = {
  name: 'postgres',
  tableName: POSTGRES_MIGRATIONS_TABLE,
  directory: 'apps/api/src/database/postgres/migrations',
  migrations: postgresMigrations,
  foreignBaseline: new PostgresBaseline1760000000000().name,
};

/**
 * The tables of the host's own schema. A plugin may not claim one of them for its storage. The names follow
 * TypeORM's table naming, from the entity list the application connection is opened with.
 */
function coreTableNames(): ReadonlySet<string> {
  const targets = new Set<unknown>(entityList);
  const naming = new DefaultNamingStrategy();
  const names = new Set<string>([postgresMigrationTrack.tableName, 'resource_usage_recovery']);
  for (const table of getMetadataArgsStorage().tables) {
    if (typeof table.target !== 'function' || !targets.has(table.target)) continue;
    names.add((table.name ?? naming.tableName(table.target.name, undefined)).toLowerCase());
  }
  for (const join of getMetadataArgsStorage().joinTables) {
    if (join.name) names.add(join.name.toLowerCase());
  }
  return names;
}

/**
 * SKIP_DATABASE_MIGRATIONS=true marks a process that builds the application but never uses the database (the Swagger
 * and AsyncAPI export, also inside the image build): it needs no DATABASE_URL, a placeholder keeps the options
 * constructible and nothing connects (see database-connection.module).
 */
function configuration(): PostgresConfig {
  try {
    return parsePostgresConfig();
  } catch (error) {
    if (process.env.SKIP_DATABASE_MIGRATIONS !== 'true') throw error;
    return { url: 'postgres://unused:unused@localhost:5432/unused', ssl: 'off', poolMax: 1, schema: 'public' };
  }
}

function createDataSourceOptions(): DataSourceOptions {
  return {
    ...postgresConnectionOptions(configuration()),
    migrations: [...postgresMigrations],
    migrationsTableName: POSTGRES_MIGRATIONS_TABLE,
    // Providers access database-backed settings while Nest constructs AppModule.
    migrationsRun: true,
    entities: entityList,
  } as DataSourceOptions;
}

export const postgresBackend: TypeOrmDatabaseBackend = {
  type: 'postgres',
  entities: entityList,
  migrationTrack: postgresMigrationTrack,
  createDataSourceOptions,
  createDataSource,
  createUnitOfWork: (source: DataSource) => createPostgresUnitOfWork(source),
  errors: postgresErrorClassifier,
  plugins: {
    createMigrationEngine: (config) => createPostgresPluginMigrationEngine(config, createDataSourceOptions),
    createPersistenceHost: createPostgresPluginPersistenceHost,
    hostTransactionScope: postgresHostTransactionScope,
    coreTableNames,
    readPermissionOwners: () => readPostgresPermissionOwners(createDataSourceOptions()),
    openStartupSettings: () => openPostgresStartupSettings(createDataSourceOptions()),
  },
  transfer: createPostgresTransfer(postgresMigrationTrack),
  // The pool serves every statement; there are no companion connections to instrument.
  onCompanionConnection: () => undefined,
  async shutdown(): Promise<void> {
    // The application connection's own pool is closed by DataSource.destroy().
  },
};

export type { EntityManager };
