import { SqlitePluginMigrations } from '../plugin-system/persistence/typeorm-adapter';
import { resolveBackendConfig } from './backend.config';
import { SqliteBackend } from './sqlite/backend';

/** Composition registry: unavailable backends fail before any connection is opened. */
export function selectDatabaseBackend(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): SqliteBackend {
  const config = resolveBackendConfig(env, cwd);
  return new SqliteBackend(config);
}

/** Plugin migration selection shares the host backend; application orchestration stays engine-neutral. */
export function createPluginMigrationPersistence(
  root: () => string,
): import('../plugin-system/persistence/port').PluginMigrationPersistence {
  resolveBackendConfig();
  return new SqlitePluginMigrations(root);
}
