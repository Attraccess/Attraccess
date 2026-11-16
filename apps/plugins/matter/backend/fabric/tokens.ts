/** Reads the name of the last plugin migration that was applied to this installation (null when none is known). */
export type PluginMigrationReader = () => Promise<string | null>;
export const PLUGIN_MIGRATION_READER = Symbol.for('attraccess.matter.migration-reader');
