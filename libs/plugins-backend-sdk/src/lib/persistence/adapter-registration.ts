import type { DataSource, EntityManager, MigrationInterface } from 'typeorm';
import type { PluginEntityClass } from '../entity';
import type { PluginOperationToken } from './host-operations';

/** Available only to a plugin's SQLite adapter/composition code. */
export interface SqlitePluginAdapterContext {
  readonly backend: 'sqlite';
  readonly dataSource: DataSource;
  /** The caller's transaction when resolving a transaction-bound operation port. */
  readonly manager: EntityManager;
}

export interface PluginOperationAdapter<TOperations = unknown> {
  readonly token: PluginOperationToken<TOperations>;
  create(context: SqlitePluginAdapterContext): TOperations;
}

export interface SqlitePluginRegistration {
  readonly backend: 'sqlite';
  readonly entities?: readonly PluginEntityClass[];
  /** Released names and ordering remain part of the plugin's migration identity. */
  readonly migrations?: readonly (new () => MigrationInterface)[];
  readonly operations?: readonly PluginOperationAdapter[];
}

/** Intersect this with the neutral PluginBackendModule in plugin composition. */
export interface PluginBackendAdapters {
  readonly persistenceAdapters: readonly SqlitePluginRegistration[];
}
