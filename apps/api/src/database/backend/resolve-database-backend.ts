import type { DataSource, DataSourceOptions, EntityManager } from 'typeorm';
import type { DatabaseBackend } from './database-backend';
import { DatabaseType, parseDatabaseType } from './database-type';
import { postgresBackend } from '../postgres/postgres-backend';
import { registerPersistenceErrorClassifier } from '../persistence-errors';

export { parseDatabaseType, UnsupportedDatabaseTypeError } from './database-type';

/** A backend as the application composes it: on TypeORM, with its DataSource and EntityManager. */
export type TypeOrmDatabaseBackend = DatabaseBackend<DataSource, DataSourceOptions, EntityManager>;

/** Every backend the application can run on, by DATABASE_TYPE. Adding a backend means adding its object here. */
export const DATABASE_BACKENDS: Readonly<Record<DatabaseType, TypeOrmDatabaseBackend>> = { postgres: postgresBackend };

/**
 * Resolves the configured backend and activates its error interpretation. Throws before any connection, migration
 * or plugin work happens when DATABASE_TYPE is not supported.
 */
export function resolveDatabaseBackend(env: NodeJS.ProcessEnv = process.env): TypeOrmDatabaseBackend {
  const backend = DATABASE_BACKENDS[parseDatabaseType(env)];
  registerPersistenceErrorClassifier(backend.errors);
  return backend;
}
