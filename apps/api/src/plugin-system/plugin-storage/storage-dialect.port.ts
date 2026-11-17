import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import type { CompiledField, CompiledPluginStorage, CompiledTable, ResolvedStep } from './storage-model';

/**
 * What differs between database engines for plugin storage. A backend provides one dialect (statement syntax, value
 * representation) and one executor (how a statement runs); the record port, the query compiler and the migration
 * runner are shared. ATT-584 adds a PostgreSQL dialect and executor next to the SQLite ones.
 */
export interface PluginStorageDialect {
  quote(identifier: string): string;
  /** The parameter marker of the n-th parameter (1-based). */
  placeholder(position: number): string;
  /** A canonical value (see storage-values) as the engine stores it. */
  encode(field: CompiledField, value: unknown): unknown;
  /** A stored value back as the canonical JavaScript value. */
  decode(field: CompiledField, stored: unknown): unknown;
  /** `LIMIT ... OFFSET ...` in the engine's syntax; an empty string when neither is given. */
  limit(limit: number | undefined, offset: number | undefined): string;
  /** A case-sensitive prefix test of the quoted column; `prefixLength` is the prefix length in characters. */
  startsWith(column: string, placeholder: string, prefixLength: number): string;
  /** Orders nulls as the lowest value: first ascending, last descending. */
  orderTerm(column: string, direction: 'asc' | 'desc'): string;
}

/** Result of a statement that writes. */
export interface PluginStorageWriteResult {
  readonly affected: number;
  /** The key of the row an insert created (engines with row ids); undefined otherwise. */
  readonly insertedId?: number;
}

/** Runs statements on one connection or transaction. Parameters are always bound, never spliced. */
export interface PluginStorageExecutor {
  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult>;
}

/**
 * How the record port reaches an executor. `scope` is the transaction scope the call joined, if any. A write
 * without a scope runs in a transaction of its own (one unit of work for the call); a read without a scope reads
 * committed state. Errors from `work` pass through unchanged so the caller can map them.
 */
export interface PluginStorageSessions {
  run<T>(access: 'read' | 'write', scope: PluginTransactionScope | undefined, work: (executor: PluginStorageExecutor) => Promise<T>): Promise<T>;
}

/** Turns the resolved migration steps into the engine's DDL. Pure: it only builds statements. */
export interface PluginStorageDdl {
  statements(step: ResolvedStep): string[];
}

/**
 * The engine-specific side of the migration runner. Everything runs inside one transaction: the version bookkeeping,
 * the DDL and the data steps commit together or not at all.
 */
export interface PluginStorageMigrationSession {
  /** Versions recorded for the plugin, ascending. Empty when the plugin has no bookkeeping yet. */
  appliedVersions(): Promise<number[]>;
  recordVersion(entry: { version: number; name: string; source: 'migrated' | 'adopted' }): Promise<void>;
  /** The names in the plugin's legacy TypeORM migrations table, or null when that table does not exist. */
  legacyMigrationNames(): Promise<string[] | null>;
  execute(statements: readonly string[]): Promise<void>;
  /** The record port of `schema` over this transaction, for a data step. */
  recordPort(schema: ReadonlyMap<string, CompiledTable>): unknown;
  /** Drops the tables (children first), the version bookkeeping and the legacy migrations table of the plugin. */
  dropAll(tables: readonly string[]): Promise<void>;
}

export interface PluginStorageMigrationDriver {
  /** Runs `work` in one transaction on a connection of its own; commits when it resolves, rolls back when it throws. */
  transaction<T>(storage: CompiledPluginStorage, work: (session: PluginStorageMigrationSession) => Promise<T>): Promise<T>;
}
