import type { DataSource } from 'typeorm';

/**
 * The neutral form of a whole database for export, import and backup (docs/en/developer/adding-a-database-backend.md,
 * "Export, import and backup contract"). It carries no engine syntax: each backend adapter converts its own storage
 * to and from it, so a snapshot written from one engine can in principle be read by another (ATT-584).
 */

/** How the value of a column is represented in a snapshot, independent of the engine's column type. */
export type SnapshotColumnKind =
  /** Whole numbers, exact. Values beyond the double precision range travel as `{ integer: '<decimal digits>' }`. */
  | 'integer'
  /** Binary floating point as stored (durations and other measurements that are not money or meter readings). */
  | 'real'
  | 'boolean'
  /** An instant: ISO-8601 in UTC with milliseconds (`2026-06-01T12:00:00.123Z`), whatever the engine stores. */
  | 'timestamp'
  /** Text, including exact decimal strings (meter readings) and JSON documents. Never re-interpreted. */
  | 'text'
  | 'blob';

export type SnapshotValue =
  null | boolean | number | string | { readonly integer: string } | { readonly blob: string /* base64 */ };

export interface SnapshotColumn {
  readonly name: string;
  readonly kind: SnapshotColumnKind;
}

export interface TableSnapshot {
  readonly name: string;
  /** Stored columns only: values the engine derives (generated columns) are recomputed on import, not copied. */
  readonly columns: readonly SnapshotColumn[];
  /** One array per row, in the order of `columns`, rows ordered by primary key. */
  readonly rows: readonly (readonly SnapshotValue[])[];
}

/** One applied migration as the engine's migration table records it. */
export interface MigrationRecord {
  readonly timestamp: number;
  readonly name: string;
}

export interface PluginSnapshot {
  readonly id: string;
  /** The plugin version the data belongs to; a restore needs the same plugin build to read its tables. */
  readonly version: string;
  /** Tables the plugin owns. Their rows are in `DatabaseSnapshot.tables` like every other table. */
  readonly tables: readonly string[];
  /** The plugin's own migration state, separate from the core track. */
  readonly migrations: readonly MigrationRecord[];
}

export interface DatabaseSnapshot {
  readonly format: 1;
  /** The backend that wrote the snapshot (`DatabaseType`). */
  readonly backend: string;
  /** Core migration state of the source: the snapshot is only valid with the application version that wrote it. */
  readonly core: { readonly track: string; readonly migrations: readonly MigrationRecord[] };
  readonly plugins: readonly PluginSnapshot[];
  /** Every table of the database, core and plugin, including the migration tables. */
  readonly tables: readonly TableSnapshot[];
  /** Next generated key per table, where the engine tracks it (a deleted highest id must not be reused). */
  readonly sequences: Readonly<Record<string, number>>;
}

export interface PluginDescriptor {
  readonly id: string;
  readonly version: string;
  readonly tables: readonly string[];
}

export interface ExportSnapshotOptions {
  /** Plugins whose tables and migration state belong to the backup, as the plugin system knows them. */
  readonly plugins?: readonly PluginDescriptor[];
}

/** Raised before anything is written when a snapshot does not fit the database it is restored into. */
export class SnapshotIncompatibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotIncompatibleError';
  }
}

/**
 * The export/import capability of a backend. Import restores into a database that already has the schema of the
 * snapshot's migration state (the same core track and the same plugin migrations), replaces its data completely, and
 * either succeeds fully or changes nothing.
 */
export interface DatabaseTransfer {
  exportSnapshot(source: DataSource, options?: ExportSnapshotOptions): Promise<DatabaseSnapshot>;
  importSnapshot(target: DataSource, snapshot: DatabaseSnapshot): Promise<void>;
}

/** Snapshots are plain JSON; this is the one place that fixes how they are written and read. */
export function serializeSnapshot(snapshot: DatabaseSnapshot): string {
  return JSON.stringify(snapshot);
}

export function parseSnapshot(text: string): DatabaseSnapshot {
  const parsed = JSON.parse(text) as DatabaseSnapshot;
  if (parsed?.format !== 1)
    throw new SnapshotIncompatibleError(`Unsupported snapshot format ${String(parsed?.format)}`);
  return parsed;
}
