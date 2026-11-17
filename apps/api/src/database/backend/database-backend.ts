import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import type {
  PluginMigrationEngine,
  PluginMigrationEngineConfig,
} from '../../plugin-system/persistence/plugin-migration-engine.port';
import type { PluginPersistenceHost } from '../../plugin-system/persistence/plugin-persistence-host.port';
import type { StandaloneSettingsRows } from '../../settings/settings-rows.port';
import type { PersistenceErrorClassifier } from '../persistence-errors';
import type { DatabaseTransfer } from '../transfer-snapshot';
import type { ScopedUnitOfWork, TransactionScope, UnitOfWork } from '../unit-of-work';
import type { DatabaseType } from './database-type';

export { DEFAULT_DATABASE_TYPE, SUPPORTED_DATABASE_TYPES } from './database-type';
export type { DatabaseType } from './database-type';

/**
 * One ordered, released migration history of one backend. The migrations table keeps its name per track so a
 * database is always upgraded by the track it was created with.
 */
export interface MigrationTrack {
  readonly name: string;
  readonly tableName: string;
  /** Repository path of the track's migration files; apps/api/migration-tracks.cjs selects the same one for the build. */
  readonly directory: string;
  /** The migration index module exports classes plus a few helper constants; TypeORM ignores the non-classes. */
  readonly migrations: readonly unknown[];
}

/** What the plugin runtime needs from a backend: plugin storage migrations, plugin storage, host transactions. */
export interface DatabaseBackendPluginHooks {
  /** The engine that creates, migrates and drops a plugin's own tables. `config` redirects its connection (tests only). */
  createMigrationEngine(config: PluginMigrationEngineConfig | null): PluginMigrationEngine;
  /** The plugin persistence host (transactions and record port). `getConnection` resolves the host connection lazily. */
  createPersistenceHost(getConnection: () => unknown): PluginPersistenceHost;
  /** Tables of the host's own schema, lowercase. A plugin's storage may not claim one. */
  coreTableNames(): ReadonlySet<string>;
  /**
   * The read-only scope plugin hooks receive for a unit of work the host opened itself. It closes together with the
   * host's scope.
   */
  hostTransactionScope(unitOfWork: UnitOfWork, scope: TransactionScope): PluginTransactionScope;
  /**
   * Which plugin owns each registered permission key (null for core keys), read on a short-lived connection before
   * the application connection opens. No database or no permission table yet: an empty map.
   */
  readPermissionOwners(): Promise<Map<string, string | null>>;
  /**
   * The settings rows on a short-lived connection, opened before the application connection (the startup license
   * check decides which license-gated plugins load). Null when the database does not exist yet (a fresh install).
   * The caller closes it.
   */
  openStartupSettings(): Promise<StandaloneSettingsRows | null>;
}

/**
 * The single composition seam between the application and one database engine: configuration, connection,
 * schema (entities and migrations), transactions, error interpretation, plugin support and shutdown. Adding a backend
 * means adding one object of this type to the registry (resolve-database-backend.ts). Feature code never talks to a
 * backend directly; it receives ports that an adapter built on this backend implements.
 *
 * The type parameters are the engine's connection, connection options and transaction handle; this file stays
 * engine-neutral, the registry fixes them for the ORM in use.
 */
export interface DatabaseBackend<TSource = unknown, TOptions = unknown, THandle = unknown> {
  readonly type: DatabaseType;
  /** Options for the application connection (entities, migration track, connection location). */
  createDataSourceOptions(): TOptions;
  /** The entity classes of this backend's schema. Plugins append their own at load time. */
  readonly entities: unknown[];
  /** Core migration track. A second track for another engine is a separate MigrationTrack on that backend. */
  readonly migrationTrack: MigrationTrack;
  /** Opens a connection with the engine's connection rules (busy handling, flow ownership, PRAGMAs). */
  createDataSource(options: TOptions): TSource;
  /** The unit of work of a connection, with the engine's transaction rules (for SQLite: one writer at a time). */
  createUnitOfWork(source: TSource): ScopedUnitOfWork<THandle>;
  readonly errors: PersistenceErrorClassifier;
  /** Neutral export and import of the whole database for backup, restore and engine transfer. */
  readonly transfer: DatabaseTransfer<TSource>;
  readonly plugins: DatabaseBackendPluginHooks;
  /**
   * Applies `hook` to every connection the backend opens beside the application connection (SQLite: the serialized
   * write connection), now and when it opens later. Query instrumentation uses it to cover all statements.
   */
  onCompanionConnection(source: TSource, hook: (connection: TSource) => void): void;
  /** Releases connections the backend opened beside the given application connection. */
  shutdown(source: TSource): Promise<void>;
}
