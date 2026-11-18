import type { DataSourceOptions } from 'typeorm';
import type {
  PluginMigrationEngine,
  PluginMigrationEngineConfig,
} from '../../plugin-system/persistence/plugin-migration-engine.port';
import { StorageMigrationRunner } from '../../plugin-system/plugin-storage/storage-migration-runner';
import { sqliteStorageDdl } from './plugin-storage/sqlite-storage-ddl';
import { SqliteStorageMigrationDriver } from './plugin-storage/sqlite-storage-migration-driver';

/**
 * The plugin storage migration engine on a SQLite file, for the import path only: it brings the plugin tables of the
 * working copy to the storage version of the installed plugin (adopting 1.x tables) before they are exported.
 */
export function createSqlitePluginMigrationEngine(file: string): PluginMigrationEngine {
  const options = { type: 'better-sqlite3', database: file } as DataSourceOptions as PluginMigrationEngineConfig;
  return new StorageMigrationRunner(
    new SqliteStorageMigrationDriver(() => options as DataSourceOptions),
    sqliteStorageDdl,
  );
}
