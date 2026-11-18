import { join } from 'path';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../database/backend';
import type { LoadedPluginManifest } from '../plugin.manifest';
import { loadPluginEntryExports } from '../runtime/module-loader';
import { type CompiledPluginStorage, PluginStorageDeclarationError } from './storage-model';
import { namespaceOf } from './storage-compile';
import { assertNamespaceUnclaimed } from './storage-registry';
import { compilePluginStorage } from './storage-schema';

/** The names of the plugins that may have storage: those requesting PLUGIN_STORAGE. */
export function storagePluginNames(plugins: readonly Pick<LoadedPluginManifest, 'name' | 'permissions'>[]): string[] {
  return plugins
    .filter((plugin) => (plugin.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE))
    .map((plugin) => plugin.name);
}

/** The namespace of a plugin name, or undefined when the name yields none (such a plugin owns no storage). */
function namespaceOrNone(name: string): string | undefined {
  try {
    return namespaceOf(name);
  } catch {
    return undefined;
  }
}

/**
 * Refuses a plugin whose storage namespace is the one of another installed plugin with storage: `foo-bar`, `foo_bar`
 * and `Foo.Bar` all keep their tables and bookkeeping under `foo_bar`, so one would read, migrate and (on
 * uninstall) drop the other's tables. Another release of the same plugin (the same name) is no conflict.
 */
export function assertDistinctNamespace(pluginName: string, installedPluginNames: readonly string[]): void {
  const own = namespaceOrNone(pluginName);
  if (own === undefined) return;
  const other = installedPluginNames.find((name) => name !== pluginName && namespaceOrNone(name) === own);
  if (other !== undefined) {
    throw new PluginStorageDeclarationError(
      pluginName,
      `its storage namespace "${own}" is the one of the installed plugin "${other}". Plugin names that differ only ` +
        'in case or punctuation would share their tables; rename the plugin',
    );
  }
}

/** Storage namespaces of the other installed plugins (plugins whose name yields no namespace have none). */
function siblingNamespaces(pluginName: string, installedPluginNames: readonly string[]): Set<string> {
  assertDistinctNamespace(pluginName, installedPluginNames);
  const namespaces = new Set<string>();
  for (const name of installedPluginNames) {
    const namespace = name === pluginName ? undefined : namespaceOrNone(name);
    if (namespace !== undefined) namespaces.add(namespace);
  }
  return namespaces;
}

/**
 * Whether a plugin about to be installed (ZIP upload, npm install or update) can keep storage beside the installed
 * plugins: its namespace is not another plugin's, and no loaded plugin keeps a table or index inside it. Read from
 * the name alone, before the plugin's code; the plugin's own names are checked when its storage is compiled.
 * `installed` is read only for a plugin that requests PLUGIN_STORAGE.
 */
export function assertInstallableNamespace(
  manifest: Pick<LoadedPluginManifest, 'name' | 'permissions'>,
  installed: () => readonly Pick<LoadedPluginManifest, 'name' | 'permissions'>[],
): void {
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) return;
  assertDistinctNamespace(manifest.name, storagePluginNames(installed()));
  const namespace = namespaceOrNone(manifest.name);
  if (namespace !== undefined) assertNamespaceUnclaimed(manifest.name, namespace);
}

/**
 * Compiles the storage declaration of a loaded backend module. Returns null when the module declares none. A
 * declaration without PLUGIN_STORAGE fails like any other capability used without its permission. The names of the
 * other installed plugins with storage keep it out of their storage namespaces (see storagePluginNames).
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
