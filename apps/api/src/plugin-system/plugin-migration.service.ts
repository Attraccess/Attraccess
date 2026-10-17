import type { LoadedPluginManifest } from './plugin.manifest';
import { recordNpmBootMigrationOutcome } from './npm/audit-state';
import { pluginActivationPlan } from './runtime/dependencies';
import { PluginService } from './plugin.service';
import { Logger } from '@nestjs/common';
import type { PluginMigrationPersistence } from './persistence/port';
import { createPluginMigrationPersistence } from '../database/backend.registry';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export class PluginMigrationService {
  protected static logger = new Logger('PluginMigrationService');
  protected static storage: PluginMigrationPersistence = createPluginMigrationPersistence(
    () => PluginService.PLUGIN_PATH,
  );

  /**
   * Runs pending up-migrations for every discovered plugin that ships them.
   * Per-plugin failures are isolated and recorded as a load error so one broken
   * plugin can never block host boot.
   */
  public static async runPendingUpMigrationsForAllPlugins(): Promise<void> {
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
      try {
        if (!getImplementationClass().hasMigrations(manifest)) {
          await recordNpmBootMigrationOutcome(
            PluginService.PLUGIN_PATH,
            manifest.name,
            manifest.version,
            'not-applicable',
          );
          ready.add(manifest.name);
          continue;
        }
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

  /** Replacements must retain every applied migration; rollback is never implicit. */
  public static async assertReplacementMigrationHistory(
    manifest: LoadedPluginManifest,
    sourceDirectory: string,
  ): Promise<void> {
    const storage = getImplementationClass().storage;
    const executed = await storage.appliedNames(manifest);
    if (!executed.length) return;
    const names = new Set(storage.migrationNames(manifest, sourceDirectory));
    const missing = executed.filter((name) => !names.has(name));
    if (missing.length)
      throw new Error(
        `Replacement blocked: target package does not contain applied migrations: ${missing.join(', ')}.`,
      );
  }

  public static configureForTesting(storage: PluginMigrationPersistence | null): void {
    getImplementationClass().storage = storage ?? createPluginMigrationPersistence(() => PluginService.PLUGIN_PATH);
  }

  public static migrationsTableName(manifest: Pick<LoadedPluginManifest, 'name'>): string {
    return getImplementationClass().storage.tableName(manifest);
  }
  public static hasMigrations(manifest: LoadedPluginManifest): boolean {
    return getImplementationClass().storage.hasMigrations(manifest);
  }
  public static async runUpMigrations(manifest: LoadedPluginManifest): Promise<number> {
    const applied = await getImplementationClass().storage.up(manifest);
    if (applied.length)
      getImplementationClass().logger.log(
        `Applied ${applied.length} migration(s) for plugin "${manifest.name}": ${applied.join(', ')}`,
      );
    return applied.length;
  }
  public static async runDownMigrations(manifest: LoadedPluginManifest): Promise<number> {
    const count = await getImplementationClass().storage.down(manifest);
    if (count) getImplementationClass().logger.log(`Reverted ${count} migration(s) for plugin "${manifest.name}".`);
    return count;
  }
}
