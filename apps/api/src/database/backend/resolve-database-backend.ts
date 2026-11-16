import { DEFAULT_DATABASE_TYPE, DatabaseBackend, DatabaseType, SUPPORTED_DATABASE_TYPES } from './database-backend';
import { sqliteBackend } from '../sqlite/sqlite-backend';
import { registerPersistenceErrorClassifier } from '../persistence-errors';

export class UnsupportedDatabaseTypeError extends Error {
  constructor(readonly received: string) {
    super(`Unsupported DATABASE_TYPE ${received}. Supported values: ${SUPPORTED_DATABASE_TYPES.join(', ')}.`);
    this.name = 'UnsupportedDatabaseTypeError';
  }
}

/** Only a plain identifier is echoed: a misplaced connection string must not reach logs. */
function describe(value: string): string {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? `"${value}"` : '(redacted: not a database type name)';
}

export function parseDatabaseType(env: NodeJS.ProcessEnv = process.env): DatabaseType {
  const raw = env.DATABASE_TYPE?.trim();
  if (!raw) return DEFAULT_DATABASE_TYPE;
  const normalized = raw.toLowerCase();
  if ((SUPPORTED_DATABASE_TYPES as readonly string[]).includes(normalized)) return normalized as DatabaseType;
  throw new UnsupportedDatabaseTypeError(describe(raw));
}

const BACKENDS: Record<DatabaseType, DatabaseBackend> = { sqlite: sqliteBackend };

/**
 * Resolves the configured backend and activates its error interpretation. Throws before any connection, migration
 * or plugin work happens when DATABASE_TYPE is not supported.
 */
export function resolveDatabaseBackend(env: NodeJS.ProcessEnv = process.env): DatabaseBackend {
  const backend = BACKENDS[parseDatabaseType(env)];
  registerPersistenceErrorClassifier(backend.errors);
  return backend;
}
