import { LoadedPluginManifest } from './plugin.manifest';

import { PluginPermission } from '@attraccess/plugins-backend-sdk';

import { recordNpmBootMigrationOutcome } from './npm/audit-state';

import { pluginActivationPlan } from './runtime/dependencies';

import { PluginService } from './plugin.service';

import { Logger } from '@nestjs/common';

import { resolveDatabaseBackend } from '../database/backend';

import type {
  PluginMigrationEngine,
  PluginMigrationEngineConfig,
  PluginStorageMigrationPlan,
} from './persistence/plugin-migration-engine.port';

import { loadPluginStorage, storagePluginNames } from './plugin-storage/storage-loader';

import { assertStorageNamesFree, claimStorageNames } from './plugin-storage/storage-registry';

import type { CompiledPluginStorage } from './plugin-storage/storage-model';

import { namespaceOf } from './plugin-storage/storage-compile';

import { recordEstablishedStorage } from './plugin-storage/storage-precedence';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

/**
 * Brings the tables of plugins that declare storage to the shape of their release, on install, startup and
 * upgrade, and drops them on uninstall. The declaration (`definePluginStorage`) is read from the plugin's backend
 * bundle; the engine behind it is the active database backend's.
 */
export class PluginMigrationService {
  protected static logger = new Logger('PluginMigrationService');

  protected static baseConfigOverride: PluginMigrationEngineConfig | null = null;

  /** The active backend's migration engine. Built on first use so a test can redirect its connection first. */
  protected static engine(): PluginMigrationEngine {
    const owner = getImplementationClass();
    return (owner.engineInstance ??= resolveDatabaseBackend().plugins.createMigrationEngine(owner.baseConfigOverride));
  }

  protected static engineInstance: PluginMigrationEngine | null = null;

  /** Whether the plugin may have storage: it requests PLUGIN_STORAGE and has a backend bundle to declare it in. */
  public static hasStorage(manifest: LoadedPluginManifest): boolean {
    return (
      (manifest.permissions ?? []).includes(PluginPermission.PLUGIN_STORAGE) &&
      Boolean(manifest.main?.backend?.directory && manifest.main?.backend?.entryPoint)
    );
  }

  /**
   * The compiled storage declaration of an installed plugin, or null when it declares none. Throws for a malformed
   * declaration (outside the plugin's namespace, migrations that do not produce the declared tables).
   */
  public static loadStorage(manifest: LoadedPluginManifest): CompiledPluginStorage | null {
    if (!getImplementationClass().hasStorage(manifest)) return null;
    return loadPluginStorage(manifest, PluginService.PLUGIN_PATH, storagePluginNames(PluginService.getPlugins()));
  }

  /**
   * Drops the tables of the plugin's committed versions together with its version bookkeeping (and the legacy
   * migrations table of a plugin adopted from 1.x). Returns whether the plugin had storage. Needs the plugin bundle on
   * disk to know which tables are its own; a declaration that conflicts with another plugin's namespace drops nothing.
   */
  public static async dropStorage(manifest: LoadedPluginManifest): Promise<boolean> {
    const storage = getImplementationClass().loadStorage(manifest);
    if (!storage) return false;
    assertStorageNamesFree(storage);
    await getImplementationClass().engine().dropAll(storage);
    getImplementationClass().logger.log(`Dropped the storage of plugin "${manifest.name}".`);
    return true;
  }

  /**
   * Reads which installed plugins with storage are established (keep committed storage), whether or not they load,
   * so a plugin without committed storage can never disable one that has it (see storage-precedence). Runs at boot
   * before any plugin's storage is compiled.
   */
  public static async resolveStoragePrecedence(): Promise<void> {
    const established: string[] = [];
    for (const manifest of PluginService.getPlugins().filter((plugin) => getImplementationClass().hasStorage(plugin))) {
      if (await getImplementationClass().isEstablished(manifest.name)) established.push(manifest.name);
    }
    recordEstablishedStorage(established);
  }

  /**
   * Whether the plugin keeps committed storage. A name without a namespace owns none. A database that cannot be read
   * counts as established: the plugin keeps its precedence rather than risk yielding its data to a newcomer.
   */
  protected static async isEstablished(pluginName: string): Promise<boolean> {
    let namespace: string;
    try {
      namespace = namespaceOf(pluginName);
    } catch {
      return false;
    }
    try {
      return await getImplementationClass().engine().hasCommittedStorage({ pluginName, namespace });
    } catch (error) {
      getImplementationClass().logger.warn(
        `Could not read the storage bookkeeping of plugin "${pluginName}"; treating it as established: ${(error as Error).message}`,
      );
      return true;
    }
  }

  /**
   * Runs pending migrations for every discovered plugin that declares storage. Per-plugin failures are isolated
   * and recorded as a load error (the plugin is quarantined and stays disabled) so one broken plugin can never
   * block host boot.
   */
  public static async runPendingUpMigrationsForAllPlugins(): Promise<void> {
    await getImplementationClass().resolveStoragePrecedence();
    const { ordered: plugins, failures } = pluginActivationPlan(PluginService.getPlugins());
    for (const [name, error] of failures) {
      const manifest = PluginService.getPlugins().find((plugin) => plugin.name === name);
      PluginService.setPluginLoadError(`${name}@${manifest.version}`, error);
    }
    const ready = new Set<string>();
    // Plugins the license keeps out (and their dependents) run no migrations. PluginModule reports them.
    const licenseBlocked = new Set<string>();
    for (const manifest of plugins) {
      if (PluginService.getLicenseMissingReason(manifest)) {
        licenseBlocked.add(manifest.name);
        continue;
      }
      if (PluginService.isPluginQuarantined(manifest)) continue;
      const failedDependency = manifest.dependencies?.find(
        (dependency) => dependency.required && !ready.has(dependency.name),
      );
      if (failedDependency && licenseBlocked.has(failedDependency.name)) {
        licenseBlocked.add(manifest.name);
        continue;
      }
      if (failedDependency) {
        PluginService.setPluginLoadError(
          `${manifest.name}@${manifest.version}`,
          new Error(`Required plugin ${failedDependency.name} failed migrations; ${manifest.name} is inactive.`),
        );
        continue;
      }
      try {
        const applied = await getImplementationClass().runUpMigrations(manifest);
        ready.add(manifest.name);
        await recordNpmBootMigrationOutcome(
          PluginService.PLUGIN_PATH,
          manifest.name,
          manifest.version,
          applied === null ? 'not-applicable' : 'succeeded',
        );
      } catch (error) {
        getImplementationClass().logger.error(
          `Failed to migrate the storage of plugin "${manifest.name}"; the plugin will be flagged as failed.`,
          error as Error,
        );
        await recordNpmBootMigrationOutcome(PluginService.PLUGIN_PATH, manifest.name, manifest.version, 'failed');
        PluginService.quarantinePlugin(manifest, error as Error);
      }
    }
  }

  /**
   * A replacement may only activate when the database can be brought to its shape without losing data: the recorded
   * versions must be known to the new release, and an unfinished 1.x history must be completed first. Changes
   * nothing; throws a PluginStorageMigrationRefused naming the reason.
   */
  public static async assertReplacementMigrationHistory(
    manifest: LoadedPluginManifest,
    sourceDirectory: string,
  ): Promise<void> {
    if (!getImplementationClass().hasStorage(manifest)) return;
    const storage = loadPluginStorage(manifest, sourceDirectory, storagePluginNames(PluginService.getPlugins()));
    if (!storage) return;
    assertStorageNamesFree(storage);
    await getImplementationClass().engine().assess(storage);
  }

  public static configureForTesting(config: PluginMigrationEngineConfig | null): void {
    getImplementationClass().baseConfigOverride = config;
    getImplementationClass().engineInstance = null;
  }

  /**
   * Migrates the storage of a single plugin. Returns the number of versions applied (an adopted 1.x database counts
   * its baseline), or null when the plugin has no storage.
   */
  public static async runUpMigrations(manifest: LoadedPluginManifest): Promise<number | null> {
    const storage = getImplementationClass().loadStorage(manifest);
    if (!storage) return null;
    // Names are claimed before anything is created: a plugin whose tables or indexes belong to (or lie in the
    // namespace of) a plugin that claimed first never touches the database.
    claimStorageNames(storage);
    const plan: PluginStorageMigrationPlan = await getImplementationClass().engine().migrate(storage);
    const count = plan.pending.length + (plan.adopt ? 1 : 0);
    if (count > 0) {
      getImplementationClass().logger.log(
        plan.adopt
          ? `Adopted the 1.x storage of plugin "${manifest.name}" as version 1 and applied ${plan.pending.length} more.`
          : `Applied ${plan.pending.length} storage migration(s) for plugin "${manifest.name}": ${plan.pending.join(', ')}.`,
      );
    }
    return count;
  }
}
