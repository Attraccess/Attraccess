import type { PluginMigrationService } from './plugin-migration.service';
import type { PluginMigrationClass } from '@attraccess/plugins-backend-sdk';
import { Logger } from '@nestjs/common';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { dataSourceConfig } from '../database/datasource';
import { loadPluginEntryExports } from './plugin-loader';
import { LoadedPluginManifest } from './plugin.manifest';
import { PluginService } from './plugin.service';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export abstract class PluginMigrationServiceRouteContext {
  protected static logger = new Logger('PluginMigrationService');

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

  protected static baseConfigOverride: Partial<DataSourceOptions> | null = null;
}
