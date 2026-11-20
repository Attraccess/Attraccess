import { existsSync } from 'fs';
import { DataSource, DataSourceOptions } from 'typeorm';
import { createDataSource } from './sqlite-connection';

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
 * Which plugin owns each registered permission key (null for core keys), read before the application connection
 * exists. Opens its own short-lived connection, like the plugin migrations. A missing database file or permission
 * table yields no owners: nothing was registered yet. Other failures are thrown.
 */
export async function readSqlitePermissionOwners(baseConfig: DataSourceOptions): Promise<Map<string, string | null>> {
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
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}
