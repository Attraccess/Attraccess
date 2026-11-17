/**
 * `@attraccess/plugins-backend-sdk/sqlite`: the SQLite-specific persistence surface of the plugin SDK.
 *
 * The SDK root has no database engine in it. A plugin that stores data in SQLite imports its entity decorators,
 * migration helpers and repository access from here, declares `persistence.backends: ["sqlite"]` in plugin.json and
 * `persistence: { sqlite: { entities } }` on its backend module. The helpers only work while the host runs SQLite;
 * with another engine they fail with a PluginPersistenceBackendError. See docs/en/plugins/database-migrations.md.
 */
import type { MigrationInterface } from 'typeorm';

export * from './lib/sqlite/typeorm-surface';
export {
  createHostTransactionScope,
  createSqlitePluginPersistence,
  managerOfTransactionScope,
  sqlitePersistence,
  type SqliteEngineAccess,
  type SqlitePersistence,
  type SqlitePluginPersistenceOptions,
} from './lib/sqlite/sqlite-persistence';

/**
 * Constructor of a SQLite migration a plugin ships. Author it like a host migration: implement `up` and `down` and
 * prefix the class name with a millisecond timestamp (`class CreateWidgets1700000000000 implements MigrationInterface`).
 */
export type SqliteMigrationClass = new () => MigrationInterface;
