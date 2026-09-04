import { Logger } from '@nestjs/common';
import { DataSource, DataSourceOptions, MigrationExecutor } from 'typeorm';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import type { PluginMigrationClass } from '@attraccess/plugins-backend-sdk';
import { dataSourceConfig } from '../database/datasource';
import { loadPluginEntryExports } from './plugin-loader';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';

/**
 * Runs plugin-shipped TypeORM migrations through the host's migration management.
 *
 * Design (see docs/en/plugins/database-migrations.md):
 *  - A plugin declares a `main.migrations` entry whose module exports migration
 *    classes (named exports, mirroring the host's `migrations/index.ts`, or a
 *    default-exported array).
 *  - Each plugin's migrations are tracked in their OWN table
 *    (`plugin_migrations_<name>`), so plugin versions never collide with host
 *    migrations or with each other, and "revert everything for this plugin" is a
 *    well-defined operation at uninstall.
 *  - We run them on a short-lived, standalone DataSource pointed at the *same*
 *    SQLite database as the host. That lets a plugin own its `migrations` array
 *    and `migrationsTableName` without mutating the host DataSource (which has a
 *    fixed entity/migration set and `migrationsRun: true`).
 *  - Up-migrations run on boot, BEFORE the Nest app (and therefore any plugin
 *    code) starts — so a plugin's tables exist before its services initialise,
 *    and already-applied migrations are skipped (safe across restarts/re-install).
 *  - Down-migrations run on uninstall, in reverse order, before the plugin's
 *    files are removed — so its tables/data are cleaned up.
 *
 * Caveat: because plugin migrations may run before the host's own migrations on a
 * fresh database, a plugin migration must not depend on (e.g. FK to) host tables.
 * Plugin schema is isolated by design — this matches the plugin sandbox boundary.
 */
export class PluginMigrationService {
  private static logger = new Logger('PluginMigrationService');

  // Test seam: override the base DataSource options (e.g. point at a temp SQLite
  // file) instead of the host's resolved config. Null = use the host config.
  private static baseConfigOverride: Partial<DataSourceOptions> | null = null;

  public static configureForTesting(config: Partial<DataSourceOptions> | null): void {
    PluginMigrationService.baseConfigOverride = config;
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

  private static migrationsEntryPath(manifest: LoadedPluginManifest): string {
    return join(
      PluginService.PLUGIN_PATH,
      manifest.main.migrations.directory,
      manifest.main.migrations.entryPoint
    );
  }

  /**
   * Loads the plugin's migration classes from its bundled migrations entry, in
   * the host's module realm so `instanceof`/TypeORM type identity hold.
   */
  public static loadMigrationClasses(manifest: LoadedPluginManifest): PluginMigrationClass[] {
    const entry = PluginMigrationService.migrationsEntryPath(manifest);
    const exports = loadPluginEntryExports(entry);

    const candidates = Array.isArray(exports.default) ? exports.default : Object.values(exports);
    const classes = candidates.filter((value): value is PluginMigrationClass => typeof value === 'function');

    if (classes.length === 0) {
      throw new Error(`Plugin "${manifest.name}" migrations entry "${entry}" exported no migration classes.`);
    }

    return classes;
  }

  private static buildDataSource(
    manifest: LoadedPluginManifest,
    migrations: PluginMigrationClass[]
  ): DataSource {
    const base = (PluginMigrationService.baseConfigOverride ?? dataSourceConfig) as DataSourceOptions;

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
      migrationsTableName: PluginMigrationService.migrationsTableName(manifest),
    } as DataSourceOptions);
  }

  /**
   * SQLite serialises writers per file. While plugin migrations run, the host
   * connection is either not open yet (boot) or idle (uninstall), but give the
   * driver a little patience rather than failing fast on a transient lock.
   */
  private static async relaxBusyTimeout(dataSource: DataSource): Promise<void> {
    if (dataSource.options.type === 'sqlite') {
      await dataSource.query('PRAGMA busy_timeout = 5000');
    }
  }

  /** Runs all pending up-migrations for a single plugin. Returns the count applied. */
  public static async runUpMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!PluginMigrationService.hasMigrations(manifest)) {
      return 0;
    }

    const classes = PluginMigrationService.loadMigrationClasses(manifest);
    const dataSource = PluginMigrationService.buildDataSource(manifest, classes);
    await dataSource.initialize();

    try {
      await PluginMigrationService.relaxBusyTimeout(dataSource);
      const applied = await dataSource.runMigrations({ transaction: 'all' });
      if (applied.length > 0) {
        PluginMigrationService.logger.log(
          `Applied ${applied.length} migration(s) for plugin "${manifest.name}": ${applied
            .map((migration) => migration.name)
            .join(', ')}`
        );
      }
      return applied.length;
    } finally {
      await dataSource.destroy();
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
    const dataSource = PluginMigrationService.buildDataSource(manifest, []);
    await dataSource.initialize();

    try {
      await PluginMigrationService.relaxBusyTimeout(dataSource);
      const executed = await new MigrationExecutor(dataSource).getExecutedMigrations();
      if (executed.length === 0) return;

      if (!PluginMigrationService.hasMigrations(manifest)) {
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
        candidates.filter((value): value is PluginMigrationClass => typeof value === 'function').map(({ name }) => name),
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

  /**
   * Reverts every applied migration for a single plugin, in reverse order, then
   * drops the plugin's tracking table. Returns the count reverted.
   */
  public static async runDownMigrations(manifest: LoadedPluginManifest): Promise<number> {
    if (!PluginMigrationService.hasMigrations(manifest)) {
      return 0;
    }

    const classes = PluginMigrationService.loadMigrationClasses(manifest);
    const dataSource = PluginMigrationService.buildDataSource(manifest, classes);
    await dataSource.initialize();

    try {
      await PluginMigrationService.relaxBusyTimeout(dataSource);
      const executor = new MigrationExecutor(dataSource);
      const executed = await executor.getExecutedMigrations();

      for (let i = 0; i < executed.length; i++) {
        await dataSource.undoLastMigration({ transaction: 'all' });
      }

      // Nothing left to track — remove the plugin's bookkeeping table too.
      const tableName = PluginMigrationService.migrationsTableName(manifest);
      await dataSource.query(`DROP TABLE IF EXISTS "${tableName}"`);

      if (executed.length > 0) {
        PluginMigrationService.logger.log(
          `Reverted ${executed.length} migration(s) for plugin "${manifest.name}".`
        );
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
    const plugins = PluginService.getPlugins().filter(
      (manifest) => PluginMigrationService.hasMigrations(manifest) && !PluginService.isPluginQuarantined(manifest),
    );

    if (plugins.length === 0) {
      return;
    }

    PluginMigrationService.logger.log(`Running plugin migrations for ${plugins.length} plugin(s)...`);

    for (const manifest of plugins) {
      try {
        await PluginMigrationService.runUpMigrations(manifest);
      } catch (error) {
        PluginMigrationService.logger.error(
          `Failed to run migrations for plugin "${manifest.name}"; the plugin will be flagged as failed.`,
          error as Error
        );
        PluginService.quarantinePlugin(manifest, error as Error);
      }
    }
  }
}
