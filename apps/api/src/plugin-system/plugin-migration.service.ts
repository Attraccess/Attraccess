import { PluginMigrationsDownImplementation } from './plugin-migrations-down';

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
export class PluginMigrationService extends PluginMigrationsDownImplementation {
  // Test seam: override the base DataSource options (e.g. point at a temp SQLite
  // file) instead of the host's resolved config. Null = use the host config.
}
