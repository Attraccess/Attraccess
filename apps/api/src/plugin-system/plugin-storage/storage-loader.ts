import { join } from 'path';
import type { PluginBackendModule } from '@attraccess/plugins-backend-sdk';
import { PluginPermission, PluginPermissionError } from '@attraccess/plugins-backend-sdk';
import { resolveDatabaseBackend } from '../../database/backend';
import type { LoadedPluginManifest } from '../plugin.manifest';
import { loadPluginEntryExports } from '../runtime/module-loader';
import { PLUGIN_MIGRATION_GUIDE_URL } from '../runtime/plugin-compatibility';
import { type CompiledPluginStorage, PluginStorageDeclarationError } from './storage-model';
import { namespaceOf } from './storage-compile';
import { namespacesOverlap } from './storage-namespace';
import { isEstablishedStorage } from './storage-precedence';
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

/** An installed plugin with storage and its namespace. */
interface NamespaceHolder {
  readonly name: string;
  readonly namespace: string;
}

/**
 * The first of `others` whose namespace overlaps `namespace` (see namespacesOverlap). Another release of the same
 * plugin (the same name) never does.
 */
function overlappingPlugin(
  pluginName: string,
  namespace: string,
  others: readonly string[],
): NamespaceHolder | undefined {
  for (const name of others) {
    const theirs = name === pluginName ? undefined : namespaceOrNone(name);
    if (theirs !== undefined && namespacesOverlap(namespace, theirs)) return { name, namespace: theirs };
  }
  return undefined;
}

function overlapRefusal(pluginName: string, namespace: string, other: NamespaceHolder, why: string): Error {
  const relation = namespace === other.namespace ? 'is the one' : `overlaps the namespace "${other.namespace}"`;
  return new PluginStorageDeclarationError(
    pluginName,
    `its storage namespace "${namespace}" ${relation} of the installed plugin "${other.name}"${why}, so a table ` +
      `name of one would lie in the namespace of the other. Rename the plugin. Migration guide: ` +
      PLUGIN_MIGRATION_GUIDE_URL,
  );
}

/** Refuses a plugin without committed storage whose namespace overlaps the one of an established plugin. */
function assertNoEstablishedOverlap(pluginName: string, established: readonly string[]): void {
  const namespace = namespaceOrNone(pluginName);
  if (namespace === undefined) return;
  const other = overlappingPlugin(pluginName, namespace, established);
  if (other !== undefined) throw overlapRefusal(pluginName, namespace, other, ', which already keeps data there');
}

/**
 * The other installed plugins with storage whose namespaces the names of `pluginName` are checked against.
 *
 * Precedence (storage-precedence): an established plugin is checked only against established plugins, so a newcomer
 * can never disable it; a newcomer whose namespace overlaps an established one is refused outright, before any of its
 * names is compared. When both or neither are established, both are checked against each other: each plugin's names
 * against the other's namespace (and an equal namespace refuses both, they share one bookkeeping). Every rule is
 * symmetric or reads only names and committed state, so which plugin is refused never depends on the order plugins
 * are discovered, migrated or loaded in.
 */
function rivalsOf(pluginName: string, installedPluginNames: readonly string[]): string[] {
  const others = installedPluginNames.filter((name) => name !== pluginName);
  const established = others.filter(isEstablishedStorage);
  if (isEstablishedStorage(pluginName)) return established;
  assertNoEstablishedOverlap(pluginName, established);
  return others;
}

/** Storage namespaces of the rival plugins (see rivalsOf; plugins whose name yields no namespace have none). */
function siblingNamespaces(pluginName: string, installedPluginNames: readonly string[]): Set<string> {
  const rivals = rivalsOf(pluginName, installedPluginNames);
  assertDistinctNamespace(pluginName, rivals);
  const namespaces = new Set<string>();
  for (const name of rivals) {
    const namespace = namespaceOrNone(name);
    if (namespace !== undefined) namespaces.add(namespace);
  }
  return namespaces;
}

/**
 * Whether a plugin about to be installed (ZIP upload, npm install or update) can keep storage beside the installed
 * plugins. Read from the names alone, before the plugin's code: its namespace may not overlap the one of any
 * installed plugin that requests PLUGIN_STORAGE (loaded or not: license-blocked, quarantined, never booted), and no
 * loaded plugin may keep a table or index inside it. Another release of the same plugin is no conflict; the plugin's
 * own names are checked when its storage is compiled. `installed` is read only for a plugin that requests
 * PLUGIN_STORAGE.
 */
export function assertInstallableNamespace(
  manifest: Pick<LoadedPluginManifest, 'name' | 'permissions'>,
  installed: () => readonly Pick<LoadedPluginManifest, 'name' | 'permissions'>[],
): void {
  if (!(manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE)) return;
  const namespace = namespaceOrNone(manifest.name);
  if (namespace === undefined) return;
  const other = overlappingPlugin(manifest.name, namespace, storagePluginNames(installed()));
  if (other !== undefined) throw overlapRefusal(manifest.name, namespace, other, '');
  assertNamespaceUnclaimed(manifest.name, namespace);
}

/**
 * Compiles the storage declaration of a loaded backend module. Returns null when the module declares none. A
 * declaration without PLUGIN_STORAGE fails like any other capability used without its permission. The names of the
 * other installed plugins with storage keep it out of their storage namespaces (see storagePluginNames), subject to
 * the precedence of established plugins (see rivalsOf).
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
