/**
 * Whether an administrator changed plugin files on disk (install, update, upload, removal) that only take effect after
 * a restart. Held per process: the restart that applies the changes starts with it cleared.
 */
let restartRequired = false;

/** Records that plugin changes on disk wait for a restart, which an administrator triggers. */
export function markPluginRestartRequired(): void {
  restartRequired = true;
}

export function isPluginRestartRequired(): boolean {
  return restartRequired;
}

/** Called when the plugin system is (re)configured, as at process start. */
export function clearPluginRestartRequired(): void {
  restartRequired = false;
}
