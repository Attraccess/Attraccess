import type { PluginPersistenceContext, PluginStorageContext, PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import type { PluginMigrationEngine } from '../../../plugin-system/persistence/plugin-migration-engine.port';
import type { CompiledPluginStorage } from '../../../plugin-system/plugin-storage/storage-model';
import type { PluginHostDataPort } from '../../../plugin-system/persistence/plugin-host-data.port';
import type { TransactionScope, UnitOfWork } from '../../unit-of-work';

/** One independent connection to the database under test with the plugin storage host built on it. */
export interface StorageConnection {
  /** `context.persistence` and `context.storage` of a plugin on this connection. */
  contexts(
    pluginName: string,
    storage: CompiledPluginStorage | null,
  ): { persistence: PluginPersistenceContext; storage: PluginStorageContext };
  /** The core unit of work of this connection, and the scope plugin hooks get for a transaction it opened. */
  readonly unitOfWork: UnitOfWork;
  hostScope(scope: TransactionScope): PluginTransactionScope;
  /** The host data ports of this connection (`context.hostData`, unguarded). */
  readonly hostData: PluginHostDataPort;
  /** A core write in the unit of work of `scope`: a resource row. Returns its id. */
  insertResource(scope: TransactionScope, name: string): Promise<number>;
}

export interface ColumnInfo {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly primaryKey: boolean;
}

/**
 * A migrated database of the backend under test, with the introspection and seeding the suite needs for its
 * assertions. ATT-584 adds a PostgreSQL fixture next to the SQLite one; the suite stays as it is.
 */
export interface StorageDatabase {
  connect(): Promise<StorageConnection>;
  /** The migration engine of the backend, on its own short-lived connections. */
  readonly engine: PluginMigrationEngine;
  /** Tables the host's own schema owns (lowercase). */
  coreTables(): ReadonlySet<string>;
  tables(): Promise<string[]>;
  columns(table: string): Promise<ColumnInfo[]>;
  indexes(table: string): Promise<string[]>;
  /** Every table that is not part of the host schema, rows included: equal before and after a refusal. */
  snapshot(): Promise<string>;
  /** A statement in the engine's own syntax, for building states the host itself no longer creates (1.x tables). */
  execute(sql: string): Promise<void>;
  /** A core resource, committed. Returns its id. */
  seedResource(name: string): Promise<number>;
  close(): Promise<void>;
}

export interface StorageBackendFixture {
  readonly name: string;
  create(): Promise<StorageDatabase>;
}
