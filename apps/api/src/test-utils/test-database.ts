import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { resolveDatabaseBackend } from '../database/backend';

/**
 * The one place tests open a real database. It goes through the DatabaseBackend seam selected by DATABASE_TYPE, so a
 * spec runs on whichever backend the suite is pointed at and the connection rules (busy handling, flow ownership,
 * pragmas) are the application's own. Specs must not hand-build `new DataSource({ type: 'better-sqlite3', ... })`.
 */
export interface TestDatabaseOptions {
  /** Where the database lives: a file path, or the backend's in-memory location. Defaults to a private in-memory one. */
  location?: string;
  /** Entity classes to map. Defaults to the backend's complete entity set. */
  entities?: unknown[];
  /** Migrations to know about. Defaults to the backend's released track. */
  migrations?: readonly unknown[];
  /** Creates the schema from the entities instead of running migrations (fast specs that do not test migrations). */
  synchronize?: boolean;
  /** Name of the table that records the applied migrations (plugins keep their own). Defaults to the track's. */
  migrationsTableName?: string;
  /** Runs the migration track on `initialize()`. Off by default: tests choose when and how far to migrate. */
  migrationsRun?: boolean;
}

const IN_MEMORY = ':memory:';

export function createTestDataSourceOptions(options: TestDatabaseOptions = {}): DataSourceOptions {
  const backend = resolveDatabaseBackend();
  return {
    ...backend.createDataSourceOptions(),
    // `database` is the location key of every file based TypeORM driver; a server backend maps its URL here.
    database: options.location ?? IN_MEMORY,
    entities: options.entities ?? backend.entities,
    migrations: [...(options.migrations ?? backend.migrationTrack.migrations)],
    synchronize: options.synchronize ?? false,
    migrationsRun: options.migrationsRun ?? false,
    migrationsTableName: options.migrationsTableName ?? backend.migrationTrack.tableName,
  } as DataSourceOptions;
}

/** Opens a test database through the backend's connection factory. The caller owns `closeTestDataSource`. */
export async function createTestDataSource(options: TestDatabaseOptions = {}): Promise<DataSource> {
  const backend = resolveDatabaseBackend();
  return backend.createDataSource(createTestDataSourceOptions(options)).initialize();
}

/** Releases the backend's extra connections and the DataSource. Safe to call twice. */
export async function closeTestDataSource(source: DataSource | undefined): Promise<void> {
  if (!source) return;
  await resolveDatabaseBackend().shutdown(source);
  if (source.isInitialized) await source.destroy();
}

export interface TestDatabaseLocation {
  readonly directory: string;
  /** A file path inside `directory`, for specs that reopen the same database (independent connections, upgrades). */
  readonly location: string;
  remove(): Promise<void>;
}

export async function createTestDatabaseLocation(prefix = 'attraccess-test-'): Promise<TestDatabaseLocation> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  return {
    directory,
    location: join(directory, 'attraccess.sqlite'),
    remove: () => rm(directory, { recursive: true, force: true }),
  };
}
