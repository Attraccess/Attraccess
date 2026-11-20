import type {
  PluginPersistenceContext,
  PluginStorageContext,
  PluginTransactionScope,
} from '@attraccess/plugins-backend-sdk';
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
 * assertions. PostgreSQL is the runtime backend; the SQLite flavor is left for the transfer specs that read 1.x data.
 */
export interface StorageDatabase {
  /** The engine family: the few cases that depend on how it stores data (a binary value in a text column) branch on it. */
  readonly flavor: 'sqlite' | 'postgres';
  /** `busyTimeoutMs` bounds how long the connection waits for another one's write lock (default: the host's). */
  connect(options?: { busyTimeoutMs?: number }): Promise<StorageConnection>;
  /** The migration engine of the backend, on its own short-lived connections. */
  readonly engine: PluginMigrationEngine;
  /** Tables the host's own schema owns (lowercase). */
  coreTables(): ReadonlySet<string>;
  tables(): Promise<string[]>;
  columns(table: string): Promise<ColumnInfo[]>;
  indexes(table: string): Promise<string[]>;
  /**
   * Every table that is not part of the host schema with its indexes and rows: equal before and after a refusal.
   * `except` leaves out the named tables and their indexes (a plugin's version bookkeeping, for an adoption).
   */
  snapshot(options?: { readonly except?: readonly string[] }): Promise<string>;
  /**
   * Rows as another process would read them: on a plain connection outside the host's flow guards, so uncommitted
   * writes of a running transaction are invisible. `sql` is in the engine's own syntax.
   */
  committed(sql: string): Promise<Array<Record<string, unknown>>>;
  /** A statement in the engine's own syntax, for building states the host itself no longer creates (1.x tables). */
  execute(sql: string): Promise<void>;
  /**
   * Takes the database's write lock on a plain connection outside the host and holds it until the returned release
   * is called: every writer of the host waits for it, up to its busy timeout.
   */
  holdWriteLock(): Promise<() => Promise<void>>;
  /** A core resource, committed. Returns its id. */
  seedResource(name: string): Promise<number>;
  close(): Promise<void>;
}

export interface StorageBackendFixture {
  readonly name: string;
  readonly flavor: StorageDatabase['flavor'];
  create(): Promise<StorageDatabase>;
}
