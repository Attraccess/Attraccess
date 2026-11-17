/** Backends the application can run on. A new backend is added here and as one object in the backend registry. */
export const SUPPORTED_DATABASE_TYPES = ['sqlite'] as const;
export type DatabaseType = (typeof SUPPORTED_DATABASE_TYPES)[number];
export const DEFAULT_DATABASE_TYPE: DatabaseType = 'sqlite';

export class UnsupportedDatabaseTypeError extends Error {
  constructor(readonly received: string) {
    super(`Unsupported DATABASE_TYPE ${received}. Supported values: ${SUPPORTED_DATABASE_TYPES.join(', ')}.`);
    this.name = 'UnsupportedDatabaseTypeError';
  }
}

/** Only a plain identifier is echoed: a misplaced connection string must not reach logs. */
function describeValue(value: string): string {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? `"${value}"` : '(redacted: not a database type name)';
}

/**
 * The one reading of DATABASE_TYPE (the configuration schema and the backend registry both use it): surrounding
 * blanks and case are ignored, unset or empty selects the default. Throws UnsupportedDatabaseTypeError otherwise.
 */
export function parseDatabaseTypeValue(value: unknown): DatabaseType {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return DEFAULT_DATABASE_TYPE;
  const normalized = raw.toLowerCase();
  if ((SUPPORTED_DATABASE_TYPES as readonly string[]).includes(normalized)) return normalized as DatabaseType;
  throw new UnsupportedDatabaseTypeError(describeValue(raw));
}

export function parseDatabaseType(env: NodeJS.ProcessEnv = process.env): DatabaseType {
  return parseDatabaseTypeValue(env.DATABASE_TYPE);
}
