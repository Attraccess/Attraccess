import { MigrationExecutor, DataSource, DataSourceOptions } from 'typeorm';

import { LoadedPluginManifest } from './plugin.manifest';

import { type PluginMigrationClass } from '@attraccess/plugins-backend-sdk';

import { join, dirname } from 'path';

import { recordNpmBootMigrationOutcome } from './npm/audit-state';

import { pluginActivationPlan } from './runtime/dependencies';

import { loadPluginEntryExports } from './runtime/module-loader';

import { PluginService } from './plugin.service';

import { Logger } from '@nestjs/common';

import { mkdirSync } from 'fs';

import { dataSourceConfig } from '../database/datasource';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export class PluginMigrationService {
  protected static logger = new Logger('PluginMigrationService');

  protected static baseConfigOverride: Partial<DataSourceOptions> | null = null;

  /**
   * Reverts every applied migration for a single plugin, in reverse order, then
   * drops the plugin's tracking table. Returns the count reverted.
   */
  public static async runDownMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!getImplementationClass().hasMigrations(manifest)) {
      return 0;
    }

    const classes = getImplementationClass().loadMigrationClasses(manifest);
    const dataSource = getImplementationClass().buildDataSource(manifest, classes);
    await dataSource.initialize();

    try {
      await getImplementationClass().relaxBusyTimeout(dataSource);
      const executor = new MigrationExecutor(dataSource);
      const executed = await executor.getExecutedMigrations();

      for (let i = 0; i < executed.length; i++) {
        await dataSource.undoLastMigration({ transaction: 'all' });
      }

      // Nothing left to track — remove the plugin's bookkeeping table too.
      const tableName = getImplementationClass().migrationsTableName(manifest);
      await dataSource.query(`DROP TABLE IF EXISTS "${tableName}"`);

      if (executed.length > 0) {
        getImplementationClass().logger.log(`Reverted ${executed.length} migration(s) for plugin "${manifest.name}".`);
      }
      return executed.length;
    } finally {
      await dataSource.destroy();
    }
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

  public static configureForTesting(config: Partial<DataSourceOptions> | null): void {
    getImplementationClass().baseConfigOverride = config;
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

  protected static buildDataSource(manifest: LoadedPluginManifest, migrations: PluginMigrationClass[]): DataSource {
    const base = (getImplementationClass().baseConfigOverride ?? dataSourceConfig) as DataSourceOptions;

    const databaseFile = (base as { database?: unknown }).database;
    if (typeof databaseFile === 'string') {
      // The host normally creates the storage dir, but plugin up-migrations may
      // run before the host DataSource opens on a fresh install.
      mkdirSync(dirname(databaseFile), { recursive: true });
    }

    return new DataSource({
      ...base,
      entities: [],
      synchronize: false,
      migrationsRun: false,
      migrations,
      migrationsTableName: getImplementationClass().migrationsTableName(manifest),
    } as DataSourceOptions);
  }

  /**
   * SQLite serialises writers per file. While plugin migrations run, the host
   * connection is either not open yet (boot) or idle (uninstall), but give the
   * driver a little patience rather than failing fast on a transient lock.
   */
  protected static async relaxBusyTimeout(dataSource: DataSource): Promise<void> {
    if (dataSource.options.type === 'sqlite') {
      await dataSource.query('PRAGMA busy_timeout = 5000');
    }
  }

  /** Runs all pending up-migrations for a single plugin. Returns the count applied. */
  public static async runUpMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!getImplementationClass().hasMigrations(manifest)) {
      return 0;
    }

    const classes = getImplementationClass().loadMigrationClasses(manifest);
    const dataSource = getImplementationClass().buildDataSource(manifest, classes);
    await dataSource.initialize();

    try {
      await getImplementationClass().relaxBusyTimeout(dataSource);
      const applied = await dataSource.runMigrations({ transaction: 'all' });
      if (applied.length > 0) {
        getImplementationClass().logger.log(
          `Applied ${applied.length} migration(s) for plugin "${manifest.name}": ${applied
            .map((migration) => migration.name)
            .join(', ')}`,
        );
      }
      return applied.length;
    } finally {
      await dataSource.destroy();
    }
  }
}
