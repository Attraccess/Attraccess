import type { PluginStorageFieldType, PluginStorageDefault } from '@attraccess/plugins-backend-sdk';

/**
 * The host's compiled form of a plugin's storage declaration. Everything the record port, the DDL generator and the
 * migration runner touch is resolved here: logical names are mapped to validated physical identifiers once, so no
 * plugin-supplied string ever reaches a statement as an identifier.
 */

export interface CompiledField {
  readonly name: string;
  /** Physical column name. Equals `name` unless the declaration adopted an existing column. */
  readonly column: string;
  readonly type: PluginStorageFieldType;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly default?: PluginStorageDefault;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly generated: boolean;
}

export interface CompiledIndex {
  /** Physical index name, unique in the database. */
  readonly name: string;
  readonly fields: readonly string[];
  readonly unique: boolean;
}

export interface CompiledForeignKey {
  readonly fields: readonly string[];
  /** Logical name of the referenced table of the same plugin. */
  readonly references: string;
  /** Physical name of the referenced table. */
  readonly referencesPhysical: string;
  /** Logical names of the referenced fields: the primary key or a unique index of the referenced table. */
  readonly referencedFields: readonly string[];
  /** Physical columns of the referenced fields, in the order of `fields`. */
  readonly referencedColumns: readonly string[];
  readonly onDelete?: 'cascade' | 'restrict' | 'set-null';
}

export interface CompiledTable {
  readonly logical: string;
  /** Physical table name inside the plugin's namespace. */
  readonly physical: string;
  /** Fields in declaration order. */
  readonly fields: ReadonlyMap<string, CompiledField>;
  readonly primaryKey: readonly string[];
  readonly indexes: readonly CompiledIndex[];
  readonly foreignKeys: readonly CompiledForeignKey[];
}

/** The tables of a plugin at one point of its migration history, by logical name. */
export type CompiledSchema = ReadonlyMap<string, CompiledTable>;

/** A migration step with every name resolved against the schema as it stands when the step runs. */
export type ResolvedStep =
  | { readonly op: 'createTable'; readonly table: CompiledTable }
  | { readonly op: 'dropTable'; readonly table: CompiledTable }
  | { readonly op: 'addColumn'; readonly table: CompiledTable; readonly field: CompiledField }
  | { readonly op: 'dropColumn'; readonly table: CompiledTable; readonly field: CompiledField }
  | {
      readonly op: 'renameColumn';
      readonly table: CompiledTable;
      readonly from: CompiledField;
      readonly to: CompiledField;
    }
  | { readonly op: 'addIndex'; readonly table: CompiledTable; readonly index: CompiledIndex }
  | { readonly op: 'dropIndex'; readonly table: CompiledTable; readonly index: CompiledIndex };

export interface CompiledMigration {
  readonly version: number;
  readonly name: string;
  readonly steps: readonly ResolvedStep[];
  /** The schema after this version's steps: what its data step sees. */
  readonly schemaAfter: CompiledSchema;
  readonly data?: (context: { readonly tables: unknown }) => Promise<void>;
}

export interface CompiledPluginStorage {
  readonly pluginName: string;
  /** Lowercase identifier derived from the plugin name; prefix of the plugin's tables and bookkeeping. */
  readonly namespace: string;
  /** Head shape: the tables the record port serves. */
  readonly tables: CompiledSchema;
  readonly migrations: readonly CompiledMigration[];
  /** Class names of every legacy TypeORM migration of the 1.x plugin. Empty when the plugin has no legacy storage. */
  readonly legacyMigrations: readonly string[];
  /** Every physical table the migrations ever create, parents before children: the table names the plugin claims. */
  readonly ownedTables: readonly string[];
  /** The declaration object itself, to recognise it when the plugin opens its tables. */
  readonly definition: unknown;
}

/** A plugin's storage declaration is malformed or leaves its namespace. The plugin must not load. */
export class PluginStorageDeclarationError extends Error {
  constructor(pluginName: string, message: string) {
    super(`Plugin "${pluginName}" storage declaration is invalid: ${message}`);
    this.name = 'PluginStorageDeclarationError';
  }
}

/** Bookkeeping table of a plugin's neutral migrations: one row per applied version. */
export const versionsTableName = (namespace: string): string => `plugin_storage_migrations_${namespace}`;

/**
 * The tracking table the 1.x TypeORM engine kept for a plugin (`plugin_migrations_<name>`). Its name follows the
 * plugin name as written, not the lowercase namespace, exactly as 1.x derived it.
 */
export const legacyMigrationsTableName = (pluginName: string): string =>
  `plugin_migrations_${pluginName.replace(/[^a-zA-Z0-9_]/g, '_')}`;

/** The plugin's storage cannot be brought to this release's shape without losing data or guessing. Nothing changed. */
export class PluginStorageMigrationRefused extends Error {
  constructor(pluginName: string, reason: string) {
    super(`Plugin "${pluginName}" storage was not migrated: ${reason}`);
    this.name = 'PluginStorageMigrationRefused';
  }
}

/** A migration failed and its transaction was rolled back. */
export class PluginStorageMigrationFailed extends Error {
  constructor(
    pluginName: string,
    readonly version: number,
    reason: string,
  ) {
    super(`Migration ${version} of plugin "${pluginName}" failed and was rolled back: ${reason}`);
    this.name = 'PluginStorageMigrationFailed';
  }
}
