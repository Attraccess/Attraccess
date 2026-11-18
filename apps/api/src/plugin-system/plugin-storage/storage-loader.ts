import { join } from 'path';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../database/backend';
import type { LoadedPluginManifest } from '../plugin.manifest';
import { loadPluginEntryExports } from '../runtime/module-loader';
import type { CompiledPluginStorage } from './storage-model';
import { namespaceOf } from './storage-compile';
import { compilePluginStorage } from './storage-schema';

/** Storage namespaces of the other installed plugins (plugins whose name yields no namespace have none). */
function siblingNamespaces(pluginName: string, installedPluginNames: readonly string[]): Set<string> {
  const own = namespaceOf(pluginName);
  const namespaces = new Set<string>();
  for (const name of installedPluginNames) {
    try {
      const namespace = namespaceOf(name);
      if (namespace !== own) namespaces.add(namespace);
    } catch {
      // A name without a usable namespace owns no storage.
    }
  }
  return namespaces;
}

/**
 * Compiles the storage declaration of a loaded backend module. Returns null when the module declares none. A
 * declaration without PLUGIN_STORAGE fails like any other capability used without its permission. The names of the
 * other installed plugins keep it out of their storage namespaces.
 */
export function compileModuleStorage(
  manifest: Pick<LoadedPluginManifest, 'name' | 'permissions'>,
  exported: Partial<PluginBackendModule> | undefined,
  installedPluginNames: readonly string[] = [],
): CompiledPluginStorage | null {
  const definition = exported?.storage;
  if (definition === undefined || definition === null) return null;
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) {
    throw new PluginPermissionError(manifest.name, 'storage definition', PluginPermission.PLUGIN_STORAGE);
  }
  return compilePluginStorage(manifest.name, definition, {
    reservedTables: resolveDatabaseBackend().plugins.coreTableNames(),
    siblingNamespaces: siblingNamespaces(manifest.name, installedPluginNames),
  });
}

/**
 * Loads the plugin's backend entry and compiles its storage declaration, without registering anything. Used by the
 * migration lifecycle (startup, replacement, uninstall). Plugins that do not request PLUGIN_STORAGE have none and
 * their code is not loaded here.
 */
export function loadPluginStorage(
  manifest: LoadedPluginManifest,
  pluginPath: string,
  installedPluginNames: readonly string[] = [],
): CompiledPluginStorage | null {
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) return null;
  if (!manifest.main.backend?.directory || !manifest.main.backend?.entryPoint) return null;
  const exports = loadPluginEntryExports(
    join(pluginPath, manifest.main.backend.directory, manifest.main.backend.entryPoint),
  );
  return compileModuleStorage(
    manifest,
    exports.default as Partial<PluginBackendModule> | undefined,
    installedPluginNames,
  );
}
