import type { CompiledPluginStorage } from '../plugin-system/plugin-storage/storage-model';

/**
 * The neutral form of a whole database for export, import and backup (docs/en/developer/adding-a-database-backend.md,
 * "Export, import and backup contract"). It carries no engine syntax: each backend adapter converts its own storage
 * to and from it, so a snapshot written from one engine can in principle be read by another (ATT-584).
 *
 * Core tables are typed by the engine's declared column types. Plugin tables (SDK 2.0 storage) are typed by the
 * plugin's compiled storage declaration instead, because the engine form of a plugin value is not its meaning: a
 * SQLite plugin decimal is a scaled integer (`1250` for `"12.50"`) and exports as the decimal string.
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
  /**
   * An exact decimal of a plugin `f.decimal` field, as a plain decimal string with the field's scale (`"12.50"`),
   * whatever the engine stores (SQLite: a scaled integer).
   */
  | 'decimal'
  /** A calendar date of a plugin `f.date` field, `YYYY-MM-DD`, no time and no zone. */
  | 'date'
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

/**
 * A plugin with declared storage (SDK 2.0). Its rows, its version bookkeeping (`plugin_storage_migrations_<namespace>`)
 * and an adopted 1.x migrations table are in `DatabaseSnapshot.tables` like every other table.
 */
export interface PluginSnapshot {
  readonly id: string;
  /** The plugin version the data belongs to; a restore needs the same plugin build to read its tables. */
  readonly version: string;
  /** The tables of the plugin's declared storage (physical names). */
  readonly tables: readonly string[];
  /**
   * The storage state the rows belong to: the plugin's storage namespace and the versions of its declared storage
   * applied to the database, ascending. A restore needs the target at exactly these versions.
   */
  readonly storage: { readonly namespace: string; readonly versions: readonly number[] };
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

/** A plugin with declared storage as the plugin system knows it. */
export interface PluginDescriptor {
  readonly id: string;
  readonly version: string;
  /** The compiled storage declaration: it names the plugin's tables and types their columns. */
  readonly storage: CompiledPluginStorage;
}

export interface ExportSnapshotOptions {
  /** Plugins whose tables and storage state belong to the backup. */
  readonly plugins?: readonly PluginDescriptor[];
}

export interface ImportSnapshotOptions {
  /**
   * The plugins installed in the target. Every plugin of the snapshot must be among them, at the same storage
   * versions; their declarations type the plugin columns of the target.
   */
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
 * snapshot's migration state (the same core track and the same plugin storage versions), replaces its data
 * completely, and either succeeds fully or changes nothing. `TSource` is the engine's connection; the backend
 * registry fixes it.
 */
export interface DatabaseTransfer<TSource = unknown> {
  exportSnapshot(source: TSource, options?: ExportSnapshotOptions): Promise<DatabaseSnapshot>;
  importSnapshot(target: TSource, snapshot: DatabaseSnapshot, options?: ImportSnapshotOptions): Promise<void>;
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
