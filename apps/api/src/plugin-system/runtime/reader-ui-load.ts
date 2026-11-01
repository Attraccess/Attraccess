import {
  PluginPermission,
  PluginPermissionError,
  type PluginBackendModule,
  type PluginContext,
  type PreStartHook,
  type ReaderUiProvider,
  type SessionEndHook,
} from '@attraccess/plugins-backend-sdk';

export interface ReaderUiContributions {
  readerUi?: ReaderUiProvider;
  preStartHook?: PreStartHook;
  sessionEndHook?: SessionEndHook;
}

/**
 * Collects the reader UI contributions of a plugin module and enforces the permissions.
 * Throws PluginPermissionError (quarantines the plugin) when `readerUi` is declared without
 * READER_UI or a hook without ACCESS_HOOKS. Returns null when the plugin contributes nothing.
 */
export function collectReaderUiContributions(
  pluginName: string,
  permissions: readonly PluginPermission[],
  exported: Partial<PluginBackendModule> | undefined,
  context: PluginContext,
): ReaderUiContributions | null {
  if (!exported) return null;
  const granted = new Set(permissions);
  const out: ReaderUiContributions = {};

  if (exported.readerUi) {
    if (!granted.has(PluginPermission.READER_UI)) {
      throw new PluginPermissionError(pluginName, 'readerUi provider', PluginPermission.READER_UI);
    }
    out.readerUi = typeof exported.readerUi === 'function' ? exported.readerUi(context) : exported.readerUi;
  }
  for (const [field, hook] of [
    ['preStartHook', exported.preStartHook],
    ['sessionEndHook', exported.sessionEndHook],
  ] as const) {
    if (!hook) continue;
    if (!granted.has(PluginPermission.ACCESS_HOOKS)) {
      throw new PluginPermissionError(pluginName, field, PluginPermission.ACCESS_HOOKS);
    }
    if (typeof hook !== 'function') throw new Error(`Plugin ${pluginName}: ${field} must be a function`);
    out[field] = hook as never;
  }
  if (out.readerUi && typeof out.readerUi.getSlotContributions !== 'function') {
    throw new Error(`Plugin ${pluginName}: readerUi.getSlotContributions must be a function`);
  }
  return out.readerUi || out.preStartHook || out.sessionEndHook ? out : null;
}
