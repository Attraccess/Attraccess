import { join } from 'path';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../database/backend';
import type { LoadedPluginManifest } from '../plugin.manifest';
import { loadPluginEntryExports } from '../runtime/module-loader';
import type { CompiledPluginStorage } from './storage-model';
import { compilePluginStorage } from './storage-schema';

/**
 * Compiles the storage declaration of a loaded backend module. Returns null when the module declares none. A
 * declaration without PLUGIN_STORAGE fails like any other capability used without its permission.
 */
export function compileModuleStorage(
  manifest: Pick<LoadedPluginManifest, 'name' | 'permissions'>,
  exported: Partial<PluginBackendModule> | undefined,
): CompiledPluginStorage | null {
  const definition = exported?.storage;
  if (definition === undefined || definition === null) return null;
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) {
    throw new PluginPermissionError(manifest.name, 'storage definition', PluginPermission.PLUGIN_STORAGE);
  }
  return compilePluginStorage(manifest.name, definition, {
    reservedTables: resolveDatabaseBackend().plugins.coreTableNames(),
  });
}

/**
 * Loads the plugin's backend entry and compiles its storage declaration, without registering anything. Used by the
 * migration lifecycle (startup, replacement, uninstall). Plugins that do not request PLUGIN_STORAGE have none and
 * their code is not loaded here.
 */
export function loadPluginStorage(manifest: LoadedPluginManifest, pluginPath: string): CompiledPluginStorage | null {
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) return null;
  if (!manifest.main.backend?.directory || !manifest.main.backend?.entryPoint) return null;
  const exports = loadPluginEntryExports(
    join(pluginPath, manifest.main.backend.directory, manifest.main.backend.entryPoint),
  );
  return compileModuleStorage(manifest, exports.default as Partial<PluginBackendModule> | undefined);
}
