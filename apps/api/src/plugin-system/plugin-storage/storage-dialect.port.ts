import type { PluginTransactionScope } from '@attraccess/plugins-backend-sdk';
import type {
  CompiledField,
  CompiledPluginStorage,
  CompiledTable,
  PluginStorageOwner,
  ResolvedStep,
} from './storage-model';

/**
 * What differs between database engines for plugin storage. A backend provides one dialect (statement syntax, value
 * representation) and one executor (how a statement runs); the record port, the query compiler and the migration
 * runner are shared. PostgreSQL is the only runtime engine, so there is one dialect and executor.
 */
export interface PluginStorageDialect {
  quote(identifier: string): string;
  /**
   * The parameter marker of the n-th parameter (1-based). `field` is the column a filter compares the value with; an
   * engine that types its parameters (PostgreSQL) uses it to widen the marker (`$1::bigint`), so a filter value
   * outside the column's range compares instead of failing.
   */
  placeholder(position: number, field?: CompiledField): string;
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
  /**
   * The clause appended to an INSERT of one row so that {@link PluginStorageExecutor.insert} can report the
   * generated key in the quoted `column` (` RETURNING "id"` on PostgreSQL); empty when the engine reports it without
   * one (SQLite's last row id).
   */
  returning(column: string): string;
  /** The most parameters one statement may bind (SQLite: 32766). The record port refuses calls that need more. */
  readonly maxParameters: number;
}

/** Result of a statement that writes. */
export interface PluginStorageWriteResult {
  readonly affected: number;
}

/** Runs statements on one connection or transaction. Parameters are always bound, never spliced. */
export interface PluginStorageExecutor {
  query(sql: string, params: readonly unknown[]): Promise<Record<string, unknown>[]>;
  execute(sql: string, params: readonly unknown[]): Promise<PluginStorageWriteResult>;
  /**
   * Runs an INSERT of one row (built with the dialect's `returning` clause when `generatedKey` is given) and returns
   * the value the engine generated for the key column `generatedKey`, or undefined without one.
   */
  insert(sql: string, params: readonly unknown[], generatedKey: string | undefined): Promise<unknown>;
}

/**
 * How the record port reaches an executor. `scope` is the transaction scope the call joined, if any. A write
 * without a scope runs in a transaction of its own (one unit of work for the call); a read without a scope reads
 * committed state. Errors from `work` pass through unchanged so the caller can map them.
 */
export interface PluginStorageSessions {
  run<T>(
    access: 'read' | 'write',
    scope: PluginTransactionScope | undefined,
    work: (executor: PluginStorageExecutor) => Promise<T>,
  ): Promise<T>;
}

/** Turns the resolved migration steps into the engine's DDL. Pure: it only builds statements. */
export interface PluginStorageDdl {
  statements(step: ResolvedStep): string[];
}

/** What planning reads: the bookkeeping of a plugin, nothing else. */
export interface PluginStorageMigrationReader {
  /** Versions recorded for the plugin, ascending. Empty when the plugin has no bookkeeping yet. */
  appliedVersions(): Promise<number[]>;
  /** The names in the plugin's legacy TypeORM migrations table, or null when that table does not exist. */
  legacyMigrationNames(): Promise<string[] | null>;
}

/**
 * The engine-specific side of the migration runner. Everything runs inside one transaction: the version bookkeeping,
 * the DDL and the data steps commit together or not at all.
 */
export interface PluginStorageMigrationSession extends PluginStorageMigrationReader {
  recordVersion(entry: { version: number; name: string; source: 'migrated' | 'adopted' }): Promise<void>;
  execute(statements: readonly string[]): Promise<void>;
  /**
   * Refuses a step the engine cannot apply to the objects as they are (an index of another table, a constraint of an
   * adopted 1.x table that needs a rebuild). Runs before the step's statements; throwing rolls the migration back.
   */
  checkStep(step: ResolvedStep): Promise<void>;
  /** The record port of `schema` over this transaction, for a data step. */
  recordPort(schema: ReadonlyMap<string, CompiledTable>): unknown;
  /**
   * Drops the tables (children first) and the version bookkeeping of the plugin, and its legacy migrations table
   * unless `keepLegacyHistory` (it then still describes 1.x tables that stay).
   */
  dropAll(tables: readonly string[], options: { readonly keepLegacyHistory: boolean }): Promise<void>;
}

export interface PluginStorageMigrationDriver {
  /** Runs `work` in one transaction on a connection of its own; commits when it resolves, rolls back when it throws. */
  transaction<T>(
    storage: CompiledPluginStorage,
    work: (session: PluginStorageMigrationSession) => Promise<T>,
  ): Promise<T>;
  /**
   * Runs `work` in a read-only transaction on a connection of its own. It takes no write lock, so planning (an
   * upgrade check while the server runs) neither waits behind writers nor blocks them. Reading needs only the names of
   * the plugin's bookkeeping, not its declaration.
   */
  read<T>(owner: PluginStorageOwner, work: (session: PluginStorageMigrationReader) => Promise<T>): Promise<T>;
}
