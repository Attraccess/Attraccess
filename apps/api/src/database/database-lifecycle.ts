/** DI token under which the selected backend adapter provides the application's database lifecycle. */
export const DATABASE_LIFECYCLE = Symbol.for('attraccess.database.lifecycle');

/**
 * What the application bootstrap needs from the database connection: opening it, bringing the schema up to date
 * and releasing it. The connection itself stays inside the backend adapter.
 */
export interface DatabaseLifecycle {
  readonly isInitialized: boolean;
  /** The migrations this backend knows. */
  readonly migrations: readonly unknown[];
  initialize(): Promise<unknown>;
  /** True when released migrations have not been applied to the database yet. */
  showMigrations(): Promise<boolean>;
  runMigrations(): Promise<unknown>;
  /** Closes the connection. */
  destroy(): Promise<void>;
}
