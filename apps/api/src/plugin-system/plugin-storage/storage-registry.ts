import { PluginStorageDeclarationError, type CompiledPluginStorage } from './storage-model';

/**
 * Which plugin owns which physical table and index name in the database. Names are unique per database, so two
 * plugins (or a plugin and a name another plugin adopted) must never claim the same one; the plugin that claims
 * second does not load.
 */
const owners = new Map<string, string>();

function namesOf(storage: CompiledPluginStorage): string[] {
  const names: string[] = [];
  for (const migration of storage.migrations) {
    for (const table of migration.schemaAfter.values()) {
      names.push(`table:${table.physical.toLowerCase()}`);
      for (const index of table.indexes) names.push(`index:${index.name.toLowerCase()}`);
    }
  }
  for (const table of storage.tables.values()) {
    names.push(`table:${table.physical.toLowerCase()}`);
    for (const index of table.indexes) names.push(`index:${index.name.toLowerCase()}`);
  }
  for (const table of storage.ownedTables) names.push(`table:${table.toLowerCase()}`);
  return [...new Set(names)];
}

/** Claims every table and index name of `storage` for its plugin. Throws when another plugin holds one. */
export function claimStorageNames(storage: CompiledPluginStorage): void {
  const names = namesOf(storage);
  for (const name of names) {
    const owner = owners.get(name);
    if (owner !== undefined && owner !== storage.pluginName) {
      throw new PluginStorageDeclarationError(
        storage.pluginName,
        `the ${name.replace(':', ' ')} "${name.slice(name.indexOf(':') + 1)}" already belongs to plugin "${owner}"`,
      );
    }
  }
  for (const name of names) owners.set(name, storage.pluginName);
}

/** Forgets the claims of a plugin (an unloaded plugin, tests). */
export function releaseStorageNames(pluginName: string): void {
  for (const [name, owner] of owners) if (owner === pluginName) owners.delete(name);
}
