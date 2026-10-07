import type { PluginMigrationService } from './plugin-migration.service';
import type { PluginMigrationClass } from '@attraccess/plugins-backend-sdk';
import { join } from 'path';
import { MigrationExecutor } from 'typeorm';
import { recordNpmBootMigrationOutcome } from './npm-plugin-audit-state';
import { pluginActivationPlan } from './plugin-dependencies';
import { loadPluginEntryExports } from './plugin-loader';
import { PluginMigrationServiceRouteContext } from './plugin-migration.service.route-context';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export abstract class PluginPendingMigrationsRunImplementation extends PluginMigrationServiceRouteContext {
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
    const dataSource = getImplementationClass().buildDataSource(manifest, []);
    await dataSource.initialize();

    try {
      await getImplementationClass().relaxBusyTimeout(dataSource);
      const executed = await new MigrationExecutor(dataSource).getExecutedMigrations();
      if (executed.length === 0) return;

      if (!getImplementationClass().hasMigrations(manifest)) {
        throw new Error(
          `Replacement blocked: target package does not contain applied migrations: ${executed
            .map(({ name }) => name)
            .join(', ')}.`,
        );
      }

      const entry = join(sourceDirectory, manifest.main.migrations.directory, manifest.main.migrations.entryPoint);
      const exports = loadPluginEntryExports(entry);
      const candidates = Array.isArray(exports.default) ? exports.default : Object.values(exports);
      const targetMigrationNames = new Set(
        candidates
          .filter((value): value is PluginMigrationClass => typeof value === 'function')
          .map(({ name }) => name),
      );
      const missing = executed.map(({ name }) => name).filter((name) => !targetMigrationNames.has(name));
      if (missing.length > 0) {
        throw new Error(
          `Replacement blocked: target package does not contain applied migrations: ${missing.join(', ')}.`,
        );
      }
    } finally {
      await dataSource.destroy();
    }
  }
}
