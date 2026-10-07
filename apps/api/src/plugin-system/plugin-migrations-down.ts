import type { PluginMigrationService } from './plugin-migration.service';
import { MigrationExecutor } from 'typeorm';
import { PluginPendingMigrationsRunImplementation } from './plugin-pending-migrations-run';
import { LoadedPluginManifest } from './plugin.manifest';

function getImplementationClass(): typeof PluginMigrationService {
  return require('./plugin-migration.service').PluginMigrationService;
}

export abstract class PluginMigrationsDownImplementation extends PluginPendingMigrationsRunImplementation {
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
}
