import type { CompiledPluginStorage } from '../plugin-storage/storage-model';

/** Connection settings a test hands in to point the engine at its own database. Opaque to the plugin system. */
export type PluginMigrationEngineConfig = object;

/** What `assess` and `migrate` found. */
export interface PluginStorageMigrationPlan {
  /** Versions that run (or, when `adopt`, version 1 is recorded without running and the rest run). */
  readonly pending: readonly number[];
  /** The 1.x TypeORM migrations of the plugin were all applied: version 1 is recorded as the baseline. */
  readonly adopt: boolean;
}

/**
 * What the plugin lifecycle needs from the database engine to bring a plugin's own tables to the shape its
 * declaration describes. The history of every plugin is its own, so it never mixes with the host's or another
 * plugin's. The engine owns the connection, the transaction scope and the locking.
 */
export interface PluginMigrationEngine {
  /** What `migrate` would do. Changes nothing. Throws PluginStorageMigrationRefused for a state it will not touch. */
  assess(storage: CompiledPluginStorage): Promise<PluginStorageMigrationPlan>;
  /** Applies every pending version in one transaction (all or nothing). */
  migrate(storage: CompiledPluginStorage): Promise<PluginStorageMigrationPlan>;
  /**
   * Drops the tables of the plugin's committed versions, its version bookkeeping and its legacy migrations table, in
   * one transaction. Tables of a version that never committed are not the plugin's and stay.
   */
  dropAll(storage: CompiledPluginStorage): Promise<void>;
}
