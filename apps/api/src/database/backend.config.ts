import { resolveDatabasePath } from '../config/storage-path';

export interface SqliteBackendConfig {
  readonly type: 'sqlite';
  readonly database: string;
}

export type BackendConfig = SqliteBackendConfig;

/** Validate the selector before constructing connections or loading plugins. */
export function resolveBackendConfig(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): BackendConfig {
  const type = env.DATABASE_TYPE ?? 'sqlite';
  if (type !== 'sqlite') {
    // Do not include supplied values: future connection configuration may contain secrets.
    throw new Error('Unsupported DATABASE_TYPE. This installation supports sqlite only.');
  }
  return { type, database: resolveDatabasePath(env, cwd) };
}
