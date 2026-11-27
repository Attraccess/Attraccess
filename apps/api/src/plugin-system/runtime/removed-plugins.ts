/**
 * Plugins an administrator removed while their code still runs from memory until the restart. Their reader and BLE
 * calls are refused, so a removed plugin cannot recreate the readers and endpoints its removal deleted, or keep driving
 * hardware. Held per process: the restart no longer loads them.
 */
const removedPluginIds = new Set<string>();

export function markPluginRemoved(pluginId: string): void {
  removedPluginIds.add(pluginId);
}

export function isPluginRemoved(pluginId: string): boolean {
  return removedPluginIds.has(pluginId);
}

/** Called when the plugin system is (re)configured, as at process start. */
export function clearRemovedPlugins(): void {
  removedPluginIds.clear();
}

/** The message a removed plugin's refused host call carries. */
export const REMOVED_PLUGIN_MESSAGE = 'The plugin was removed; this call is refused until Attraccess restarts';
