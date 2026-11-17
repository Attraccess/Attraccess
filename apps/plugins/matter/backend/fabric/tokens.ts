/** Reads the identity of the plugin's current table layout (see `storageSchemaName`). Null when it is not known. */
export type PluginMigrationReader = () => Promise<string | null>;
export const PLUGIN_MIGRATION_READER = Symbol.for('attraccess.matter.migration-reader');
