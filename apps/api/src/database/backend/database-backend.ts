import type { DataSource, DataSourceOptions } from 'typeorm';
import type { PersistenceErrorClassifier } from '../persistence-errors';

/** Backends the application can run on. A new backend is added here, in resolveDatabaseBackend and in its adapter. */
export const SUPPORTED_DATABASE_TYPES = ['sqlite'] as const;
export type DatabaseType = (typeof SUPPORTED_DATABASE_TYPES)[number];
export const DEFAULT_DATABASE_TYPE: DatabaseType = 'sqlite';

/**
 * One ordered, released migration history of one backend. The migrations table keeps its name per track so a
 * database is always upgraded by the track it was created with.
 */
export interface MigrationTrack {
  readonly name: string;
  readonly tableName: string;
  /** The migration index module exports classes plus a few helper constants; TypeORM ignores the non-classes. */
  readonly migrations: readonly unknown[];
}

/**
 * The single composition seam between the application and one database engine: configuration, connection,
 * schema (entities and migrations), error interpretation and shutdown. Feature code never talks to a backend
 * directly; it receives ports that an adapter built on this backend implements.
 */
export interface DatabaseBackend {
  readonly type: DatabaseType;
  /** TypeORM options for the application connection (entities, migration track, connection location). */
  createDataSourceOptions(): DataSourceOptions;
  /** The entity classes of this backend's schema. Plugins append their own at load time. */
  readonly entities: unknown[];
  /** Core migration track. A second track for another engine is a separate MigrationTrack on that backend. */
  readonly migrationTrack: MigrationTrack;
  /** Opens a connection with the engine's connection rules (busy handling, flow ownership, PRAGMAs). */
  createDataSource(options: DataSourceOptions): DataSource;
  readonly errors: PersistenceErrorClassifier;
  /** Releases connections the backend opened beside the given application DataSource. */
  shutdown(source: DataSource): Promise<void>;
}
