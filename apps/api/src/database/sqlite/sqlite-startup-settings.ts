import { Setting } from '@attraccess/database-entities';
import { existsSync } from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import type { StandaloneSettingsRows } from '../../settings/settings-rows.port';
import { TypeOrmSettingsRows } from '../adapters/settings/typeorm-settings-rows';
import { createDataSource } from './sqlite-connection';

async function closeConnection(dataSource: DataSource): Promise<void> {
  if (dataSource.isInitialized) await dataSource.destroy();
}

/**
 * Opens the settings rows on a short-lived connection, before the application connection exists, like the plugin
 * migrations. Null when the database file does not exist yet (a fresh install): no empty file is created for it.
 * Runs no migrations; a missing settings table surfaces as a failed read.
 */
export async function openSqliteStartupSettings(baseConfig: DataSourceOptions): Promise<StandaloneSettingsRows | null> {
  const databaseFile = (baseConfig as { database?: unknown }).database;
  if (typeof databaseFile !== 'string' || !existsSync(databaseFile)) return null;
  const dataSource = createDataSource({
    ...baseConfig,
    entities: [Setting],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  } as DataSourceOptions);
  try {
    await dataSource.initialize();
  } catch (error) {
    await closeConnection(dataSource);
    throw error;
  }
  const rows = TypeOrmSettingsRows.forRepository(dataSource.getRepository(Setting));
  return {
    findValue: (parent, key) => rows.findValue(parent, key),
    upsertValue: (parent, key, value) => rows.upsertValue(parent, key, value),
    remove: (parent, key) => rows.remove(parent, key),
    close: () => closeConnection(dataSource),
  };
}
