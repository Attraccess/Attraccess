import type { PluginContext } from '@attraccess/plugins-backend-sdk';
import { MatterFabric } from '../devices/entities';
import * as pluginMigrations from '../migrations';
import type { PluginMigrationReader } from './tokens';

/** The host records a plugin's applied migrations in `plugin_migrations_<name>`. */
export function hostMigrationReader(context: PluginContext): PluginMigrationReader {
  return async () => {
    const table = `plugin_migrations_${context.manifest.name.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    try {
      const rows: { name: string }[] = await context
        .getRepository(MatterFabric)
        .query(`SELECT "name" FROM "${table}" ORDER BY "timestamp" DESC, "id" DESC LIMIT 1`);
      return rows[0]?.name ?? (await sharedTableMigration(context));
    } catch {
      // No per-plugin table (a host that runs plugin migrations in the shared table): use the shared one.
      return sharedTableMigration(context);
    }
  };
}

/** The newest of this plugin's own migrations in the shared `migrations` table. */
async function sharedTableMigration(context: PluginContext): Promise<string | null> {
  const names = Object.values(pluginMigrations).map((migration) => (migration as { name: string }).name);
  try {
    const rows: { name: string }[] = await context
      .getRepository(MatterFabric)
      .query('SELECT "name" FROM "migrations" ORDER BY "timestamp" DESC');
    return rows.find((row) => names.includes(row.name))?.name ?? null;
  } catch {
    return null;
  }
}
