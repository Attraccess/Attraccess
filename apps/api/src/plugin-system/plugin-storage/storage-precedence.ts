/**
 * Which installed storage plugins are established: they keep committed storage (a recorded version, an adopted 1.x
 * baseline or a 1.x migrations history). Read from the database once per boot, before any plugin's storage compiles
 * (PluginMigrationService.resolveStoragePrecedence), for every installed plugin with storage, whether or not the
 * license or a quarantine keeps it from loading.
 *
 * An established plugin never yields its namespace to a plugin without committed storage: a newcomer whose namespace
 * overlaps the one of an established plugin is refused, and the established plugin ignores it (see storage-loader).
 * Until the set is read every plugin counts as new.
 */
const established = new Set<string>();

/** Replaces the set of established storage plugins. */
export function recordEstablishedStorage(pluginNames: Iterable<string>): void {
  established.clear();
  for (const name of pluginNames) established.add(name);
}

export const isEstablishedStorage = (pluginName: string): boolean => established.has(pluginName);
