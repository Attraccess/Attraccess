import { Logger } from '@nestjs/common';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { resolveDatabaseBackend } from '../backend/resolve-database-backend';
import { acquireAdvisoryLock, POSTGRES_MIGRATION_LOCK_KEY } from './postgres-advisory-lock';
import { parsePostgresConfig, redactDatabaseUrl } from './postgres-config';
import { waitForPostgres } from './postgres-connection';

const logger = new Logger('DatabaseStartup');

/**
 * Runs before the application connection opens, before the license check, before any plugin starts and before HTTP or
 * devices are accepted: waits for PostgreSQL and applies the pending core migrations on a connection of its own while
 * holding the migration lock. Instances that start together take turns; the later ones find nothing pending (TypeORM
 * itself takes no lock). The migrations include the import of an existing SQLite installation.
 * SKIP_DATABASE_MIGRATIONS=true (a process that never uses the database): nothing.
 */
export async function migrateDatabaseAtStartup(): Promise<void> {
  if (process.env.SKIP_DATABASE_MIGRATIONS === 'true') return;
  const backend = resolveDatabaseBackend();
  const config = parsePostgresConfig();
  logger.log(`Database: PostgreSQL ${redactDatabaseUrl(config.url)} (schema ${config.schema})`);
  await waitForPostgres(config);
  const lock = await acquireAdvisoryLock(config, POSTGRES_MIGRATION_LOCK_KEY);
  let source: DataSource | undefined;
  try {
    source = backend.createDataSource({
      ...(backend.createDataSourceOptions() as DataSourceOptions),
      entities: [],
      migrationsRun: false,
    } as DataSourceOptions);
    await source.initialize();
    await source.runMigrations();
  } finally {
    if (source?.isInitialized) await source.destroy().catch(() => undefined);
    await lock.release();
  }
}
