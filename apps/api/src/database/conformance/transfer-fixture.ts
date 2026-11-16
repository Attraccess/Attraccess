import type { DatabaseSnapshot, ExportSnapshotOptions, PluginDescriptor } from '../transfer-snapshot';

/** What the transfer conformance suite needs from one database of the engine under test. */
export interface TransferDatabase {
  /** Writes the representative data set (see TRANSFER_DATASET in transfer.conformance.test-fixture.ts). */
  populate(): Promise<void>;
  /**
   * Installs a plugin the way the plugin system does: its tables and its own migration state, separate from the core
   * track. With `withData` the plugin's tables also get rows.
   */
  installPlugin(plugin: { id: string; version: string }, withData: boolean): Promise<PluginDescriptor>;
  exportSnapshot(options?: ExportSnapshotOptions): Promise<DatabaseSnapshot>;
  importSnapshot(snapshot: DatabaseSnapshot): Promise<void>;
  /** Adds a completed top-up for a user and reports the generated id and the user's resulting balance. */
  addTopUp(userId: number, amount: number): Promise<{ id: number; balance: string }>;
  /** The engine's own integrity checks (foreign keys, derived balances equal the completed transactions). */
  integrityViolations(): Promise<string[]>;
  close(): Promise<void>;
}

/**
 * A backend fixture for the export, import and backup contract. ATT-584 runs the same suite against PostgreSQL by
 * adding one of these; `create()` returns an empty database at the current release (the core track applied).
 */
export interface TransferBackendFixture {
  readonly name: string;
  create(): Promise<TransferDatabase>;
  /** Releases what the fixture shares between databases (a migrated template, a container). */
  dispose?(): Promise<void>;
}
