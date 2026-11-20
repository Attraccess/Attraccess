import { Setting } from '@attraccess/database-entities';
import { DataSource, DataSourceOptions } from 'typeorm';
import type { StandaloneSettingsRows } from '../../settings/settings-rows.port';
import { TypeOrmSettingsRows } from '../adapters/settings/typeorm-settings-rows';
import { createDataSource } from './postgres-connection';

async function tableColumns(dataSource: DataSource, table: string): Promise<string[]> {
  const rows: Array<{ column_name: string }> = await dataSource.query(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
    [table],
  );
  return rows.map((row) => row.column_name);
}

async function openShortLived(base: DataSourceOptions, entities: unknown[]): Promise<DataSource> {
  const dataSource = createDataSource({
    ...base,
    entities,
    migrations: [],
    migrationsRun: false,
    synchronize: false,
    // A short-lived read must not hold many connections.
    extra: { ...((base as { extra?: object }).extra ?? {}), max: 1 },
  } as DataSourceOptions);
  try {
    await dataSource.initialize();
  } catch (error) {
    if (dataSource.isInitialized) await dataSource.destroy();
    throw error;
  }
  return dataSource;
}

/**
 * Which plugin owns each registered permission key (null for core keys), read before the application connection
 * exists. No permission table yet (a fresh database): nothing registered, no owners.
 */
export async function readPostgresPermissionOwners(base: DataSourceOptions): Promise<Map<string, string | null>> {
  const dataSource = await openShortLived(base, []);
  try {
    const columns = await tableColumns(dataSource, 'permission');
    if (columns.length === 0) return new Map();
    const hasOwner = columns.includes('pluginName');
    const rows: Array<{ key: string; pluginName?: string | null }> = await dataSource.query(
      hasOwner ? `SELECT "key", "pluginName" FROM "permission"` : `SELECT "key" FROM "permission"`,
    );
    return new Map(rows.map((row) => [row.key, row.pluginName ?? null]));
  } finally {
    await dataSource.destroy();
  }
}

/**
 * The settings rows on a short-lived connection, for the startup license check. Null when the settings table does not
 * exist yet (a fresh install): nothing is created for it.
 */
export async function openPostgresStartupSettings(base: DataSourceOptions): Promise<StandaloneSettingsRows | null> {
  const dataSource = await openShortLived(base, [Setting]);
  if ((await tableColumns(dataSource, 'setting')).length === 0) {
    await dataSource.destroy();
    return null;
  }
  const rows = TypeOrmSettingsRows.forRepository(dataSource.getRepository(Setting));
  return {
    findValue: (parent, key) => rows.findValue(parent, key),
    upsertValue: (parent, key, value) => rows.upsertValue(parent, key, value),
    remove: (parent, key) => rows.remove(parent, key),
    close: async () => {
      if (dataSource.isInitialized) await dataSource.destroy();
    },
  };
}
