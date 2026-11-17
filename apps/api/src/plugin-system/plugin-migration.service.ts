import { LoadedPluginManifest } from './plugin.manifest';

import { type PluginMigrationClass } from '@attraccess/plugins-backend-sdk';

import { join } from 'path';

import { recordNpmBootMigrationOutcome } from './npm/audit-state';

import { pluginActivationPlan } from './runtime/dependencies';

import { loadPluginEntryExports } from './runtime/module-loader';

import { PluginService } from './plugin.service';

import { Logger } from '@nestjs/common';

import {
  createPluginMigrationEngine,
  type PluginMigrationEngineConfig,
} from '../database/adapters/plugins/plugin-migration-engine';

import type { PluginMigrationEngine } from './persistence/plugin-migration-engine.port';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export class PluginMigrationService {
  protected static logger = new Logger('PluginMigrationService');

  protected static baseConfigOverride: PluginMigrationEngineConfig | null = null;

  /** The active backend's migration engine. Built on first use so a test can redirect its connection first. */
  protected static engine(): PluginMigrationEngine {
    const owner = getImplementationClass();
    return (owner.engineInstance ??= createPluginMigrationEngine(owner.baseConfigOverride));
  }

  protected static engineInstance: PluginMigrationEngine | null = null;

  /**
   * Reverts every applied migration for a single plugin, in reverse order, then
   * drops the plugin's tracking table. Returns the count reverted.
   */
  public static async runDownMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!getImplementationClass().hasMigrations(manifest)) {
      return 0;
    }

    const classes = getImplementationClass().loadMigrationClasses(manifest);
    const tableName = getImplementationClass().migrationsTableName(manifest);
    const reverted = await getImplementationClass().engine().revertAll(tableName, classes);
    if (reverted > 0) {
      getImplementationClass().logger.log(`Reverted ${reverted} migration(s) for plugin "${manifest.name}".`);
    }
    return reverted;
  }

  /**
   * Runs pending up-migrations for every discovered plugin that ships them.
   * Per-plugin failures are isolated and recorded as a load error so one broken
   * plugin can never block host boot.
   */
  public static async runPendingUpMigrationsForAllPlugins(): Promise<void> {
    for (const manifest of PluginService.getPlugins()) {
      if (!getImplementationClass().hasMigrations(manifest))
        await recordNpmBootMigrationOutcome(
          PluginService.PLUGIN_PATH,
          manifest.name,
          manifest.version,
          'not-applicable',
        );
    }
    const { ordered: plugins, failures } = pluginActivationPlan(PluginService.getPlugins());
    for (const [name, error] of failures) {
      const manifest = PluginService.getPlugins().find((plugin) => plugin.name === name);
      PluginService.setPluginLoadError(`${name}@${manifest.version}`, error);
    }
    const ready = new Set<string>();
    for (const manifest of plugins) {
      if (PluginService.isPluginQuarantined(manifest)) continue;
      const failedDependency = manifest.dependencies?.find(
        (dependency) => dependency.required && !ready.has(dependency.name),
      );
      if (failedDependency) {
        PluginService.setPluginLoadError(
          `${manifest.name}@${manifest.version}`,
          new Error(`Required plugin ${failedDependency.name} failed migrations; ${manifest.name} is inactive.`),
        );
        continue;
      }
      if (!getImplementationClass().hasMigrations(manifest)) {
        ready.add(manifest.name);
        continue;
      }
      try {
        await getImplementationClass().runUpMigrations(manifest);
        ready.add(manifest.name);
        await recordNpmBootMigrationOutcome(PluginService.PLUGIN_PATH, manifest.name, manifest.version, 'succeeded');
      } catch (error) {
        getImplementationClass().logger.error(
          `Failed to run migrations for plugin "${manifest.name}"; the plugin will be flagged as failed.`,
          error as Error,
        );
        await recordNpmBootMigrationOutcome(PluginService.PLUGIN_PATH, manifest.name, manifest.version, 'failed');
        PluginService.quarantinePlugin(manifest, error as Error);
      }
    }
  }

  /**
   * A replacement may only activate when its migration bundle still knows every
   * migration already applied for the plugin. Running down migrations here would
   * discard data, so versions that need a schema rollback are deliberately blocked.
   */
  public static async assertReplacementMigrationHistory(
    manifest: LoadedPluginManifest,
    sourceDirectory: string,
  ): Promise<void> {
    const applied = await getImplementationClass()
      .engine()
      .listApplied(getImplementationClass().migrationsTableName(manifest));
    if (applied.length === 0) return;

    if (!getImplementationClass().hasMigrations(manifest)) {
      throw new Error(
        `Replacement blocked: target package does not contain applied migrations: ${applied.join(', ')}.`,
      );
    }

    const entry = join(sourceDirectory, manifest.main.migrations.directory, manifest.main.migrations.entryPoint);
    const exports = loadPluginEntryExports(entry);
    const candidates = Array.isArray(exports.default) ? exports.default : Object.values(exports);
    const targetMigrationNames = new Set(
      candidates.filter((value): value is PluginMigrationClass => typeof value === 'function').map(({ name }) => name),
    );
    const missing = applied.filter((name) => !targetMigrationNames.has(name));
    if (missing.length > 0) {
      throw new Error(
        `Replacement blocked: target package does not contain applied migrations: ${missing.join(', ')}.`,
      );
    }
  }

  public static configureForTesting(config: PluginMigrationEngineConfig | null): void {
    getImplementationClass().baseConfigOverride = config;
    getImplementationClass().engineInstance = null;
  }

  /**
   * Plugin-scoped migrations tracking table. Sanitised so the plugin name can be
   * dropped into an identifier safely.
   */
  public static migrationsTableName(manifest: Pick<LoadedPluginManifest, 'name'>): string {
    const safeName = manifest.name.replace(/[^a-zA-Z0-9_]/g, '_');
    return `plugin_migrations_${safeName}`;
  }

  public static hasMigrations(manifest: LoadedPluginManifest): boolean {
    return Boolean(manifest.main?.migrations?.directory && manifest.main?.migrations?.entryPoint);
  }

  protected static migrationsEntryPath(manifest: LoadedPluginManifest): string {
    return join(PluginService.PLUGIN_PATH, manifest.main.migrations.directory, manifest.main.migrations.entryPoint);
  }

  /**
   * Loads the plugin's migration classes from its bundled migrations entry, in
   * the host's module realm so `instanceof`/TypeORM type identity hold.
   */
  public static loadMigrationClasses(manifest: LoadedPluginManifest): PluginMigrationClass[] {
    const entry = getImplementationClass().migrationsEntryPath(manifest);
    const exports = loadPluginEntryExports(entry);

    const candidates = Array.isArray(exports.default) ? exports.default : Object.values(exports);
    const classes = candidates.filter((value): value is PluginMigrationClass => typeof value === 'function');

    if (classes.length === 0) {
      throw new Error(`Plugin "${manifest.name}" migrations entry "${entry}" exported no migration classes.`);
    }

    return classes;
  }

  /** Runs all pending up-migrations for a single plugin. Returns the count applied. */
  public static async runUpMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!getImplementationClass().hasMigrations(manifest)) {
      return 0;
    }

    const classes = getImplementationClass().loadMigrationClasses(manifest);
    const tableName = getImplementationClass().migrationsTableName(manifest);
    const applied = await getImplementationClass().engine().runUp(tableName, classes);
    if (applied.length > 0) {
      getImplementationClass().logger.log(
        `Applied ${applied.length} migration(s) for plugin "${manifest.name}": ${applied.join(', ')}`,
      );
    }
    return applied.length;
  }
}
