import { Logger } from '@nestjs/common';
import { existsSync } from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { dataSourceConfig } from '../../database/datasource';
import { createDataSource } from '../../database/sqlite-connection';

const logger = new Logger('PluginPermissions');

async function ownersFrom(dataSource: DataSource): Promise<Map<string, string | null>> {
  const columns: Array<{ name: string }> = await dataSource.query(`PRAGMA table_info("permission")`);
  // No table: a fresh database, nothing registered yet.
  if (columns.length === 0) return new Map();
  // Before the plugin-declared-permissions migration every row is a core key. Decided from the schema, not from a
  // failed query, so a transient error cannot turn every plugin key into a "core" key and quarantine its plugin.
  const hasOwner = columns.some((column) => column.name === 'pluginName');
  const rows: Array<{ key: string; pluginName?: string | null }> = await dataSource.query(
    hasOwner ? `SELECT "key", "pluginName" FROM "permission"` : `SELECT "key" FROM "permission"`,
  );
  return new Map(rows.map((row) => [row.key, row.pluginName ?? null]));
}

/**
 * Reads which plugin owns each registered permission key, before AppModule is imported, so plugin load can reject
 * a key another plugin registered in an earlier boot. Opens its own short-lived connection, like the plugin
 * migrations. A missing database or table yields no owners: nothing was registered yet.
 */
export async function loadRecordedPermissionOwners(
  baseConfig: DataSourceOptions = dataSourceConfig as DataSourceOptions,
): Promise<Map<string, string | null>> {
  const databaseFile = (baseConfig as { database?: unknown }).database;
  if (typeof databaseFile === 'string' && databaseFile !== ':memory:' && !existsSync(databaseFile)) return new Map();
  const dataSource = createDataSource({
    ...baseConfig,
    entities: [],
    migrations: [],
    migrationsRun: false,
    synchronize: false,
  } as DataSourceOptions);
  try {
    await dataSource.initialize();
    return await ownersFrom(dataSource);
  } catch (error) {
    // Plugin load then cannot see owners from earlier boots; the boot sync still refuses a key another plugin owns
    // (it skips the key and logs an error), so this fails closed.
    logger.error(`Could not read registered plugin permissions: ${(error as Error).message}`);
    return new Map();
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
