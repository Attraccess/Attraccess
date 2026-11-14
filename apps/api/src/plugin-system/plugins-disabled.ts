/** Whether plugins are switched off for this process. Kept apart from `PluginModule` so its controller can read it. */
let pluginsDisabled = false;

export function setPluginsDisabled(disabled: boolean): void {
  pluginsDisabled = disabled;
}

export function arePluginsDisabled(): boolean {
  return pluginsDisabled;
}
