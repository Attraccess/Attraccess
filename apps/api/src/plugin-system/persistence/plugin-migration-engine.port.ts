/** Constructor of a migration class a plugin ships. The engine adapter knows how to run it. */
export type PluginMigrationClassRef = new () => object;

/**
 * What the plugin lifecycle needs from the database engine to run a plugin's own schema migrations. Every plugin has
 * its own tracking table, so its history never mixes with the host's or another plugin's. The adapter owns the
 * connection, the transaction scope and the engine's locking.
 */
export interface PluginMigrationEngine {
  /** Names of the migrations already applied for the tracking table, oldest first. Empty when none ran. */
  listApplied(tableName: string): Promise<string[]>;
  /** Applies all pending migrations in one transaction (all or nothing) and returns the names applied. */
  runUp(tableName: string, migrations: PluginMigrationClassRef[]): Promise<string[]>;
  /**
   * Reverts every applied migration in reverse order (one transaction), then drops the tracking table. Returns the
   * count reverted.
   */
  revertAll(tableName: string, migrations: PluginMigrationClassRef[]): Promise<number>;
}
