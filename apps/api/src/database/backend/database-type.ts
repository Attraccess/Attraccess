/** Backends the application can run on. A new backend is added here and as one object in the backend registry. */
export const SUPPORTED_DATABASE_TYPES = ['postgres'] as const;
export type DatabaseType = (typeof SUPPORTED_DATABASE_TYPES)[number];
export const DEFAULT_DATABASE_TYPE: DatabaseType = 'postgres';

/** Where the upgrade from SQLite is described. */
export const UPGRADE_DOCS_URL = 'https://docs.attraccess.org/installation/updating#moving-from-sqlite-to-postgresql';

export class UnsupportedDatabaseTypeError extends Error {
  constructor(readonly received: string) {
    super(
      received.toLowerCase() === '"sqlite"'
        ? `DATABASE_TYPE "sqlite" is no longer supported: Attraccess runs on PostgreSQL. Set DATABASE_URL to a ` +
            `PostgreSQL database; existing SQLite data is moved automatically on the first start. See ${UPGRADE_DOCS_URL}.`
        : `Unsupported DATABASE_TYPE ${received}. Supported values: ${SUPPORTED_DATABASE_TYPES.join(', ')}. ` +
            `See ${UPGRADE_DOCS_URL}.`,
    );
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
