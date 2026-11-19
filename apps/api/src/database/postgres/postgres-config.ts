/**
 * The PostgreSQL connection configuration (DATABASE_URL, DATABASE_SSL, DATABASE_POOL_MAX, DATABASE_SCHEMA).
 * Validation errors never contain the URL, its password or any other part of the value: only the variable name.
 */
export const UPGRADE_DOCS_URL =
  'https://docs.attraccess.org/#/en/installation/updating?id=moving-from-sqlite-to-postgresql';

export type DatabaseSslMode = 'off' | 'require' | 'verify-ca' | 'verify-full';

export interface PostgresConfig {
  readonly url: string;
  readonly ssl: DatabaseSslMode;
  readonly poolMax: number;
  readonly schema: string;
}

export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseConfigError';
  }
}

export const DEFAULT_POOL_MAX = 10;
const SSL_MODES: readonly DatabaseSslMode[] = ['off', 'require', 'verify-ca', 'verify-full'];
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

function parseSsl(raw: string | undefined): DatabaseSslMode {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'false' || value === '0' || value === 'disable') return 'off';
  if (value === 'true' || value === '1') return 'require';
  if ((SSL_MODES as readonly string[]).includes(value)) return value as DatabaseSslMode;
  throw new DatabaseConfigError(`DATABASE_SSL must be one of ${SSL_MODES.join(', ')} (value not shown).`);
}

function parsePoolMax(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_POOL_MAX;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 500) {
    throw new DatabaseConfigError('DATABASE_POOL_MAX must be an integer between 1 and 500.');
  }
  return value;
}

function parseUrl(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) {
    throw new DatabaseConfigError(
      'DATABASE_URL is required, for example postgres://user:password@host:5432/attraccess. ' +
        `See ${UPGRADE_DOCS_URL}.`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new DatabaseConfigError('DATABASE_URL is not a valid URL (postgres://user:password@host:5432/database).');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new DatabaseConfigError('DATABASE_URL must start with postgres:// or postgresql://.');
  }
  if (!parsed.hostname && !parsed.searchParams.has('host')) {
    throw new DatabaseConfigError('DATABASE_URL has no host.');
  }
  if (parsed.pathname.length <= 1) throw new DatabaseConfigError('DATABASE_URL names no database.');
  return value;
}

/** Throws a DatabaseConfigError (without any secret in the message) when the configuration is unusable. */
export function parsePostgresConfig(env: NodeJS.ProcessEnv = process.env): PostgresConfig {
  const schema = env.DATABASE_SCHEMA?.trim() || 'public';
  if (!IDENTIFIER.test(schema)) throw new DatabaseConfigError('DATABASE_SCHEMA must be a plain SQL identifier.');
  return {
    url: parseUrl(env.DATABASE_URL),
    ssl: parseSsl(env.DATABASE_SSL),
    poolMax: parsePoolMax(env.DATABASE_POOL_MAX),
    schema,
  };
}

/** The connection URL with the password replaced, safe for logs. */
export function redactDatabaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return `${parsed.protocol}//${parsed.username ? `${decodeURIComponent(parsed.username)}@` : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparsable database url)';
  }
}

/** node-postgres `ssl` option for a mode. `require` encrypts without verifying the certificate chain. */
export function sslOption(
  mode: DatabaseSslMode,
): false | { rejectUnauthorized: boolean; checkServerIdentity?: () => undefined } {
  switch (mode) {
    case 'off':
      return false;
    case 'require':
      return { rejectUnauthorized: false };
    case 'verify-ca':
      return { rejectUnauthorized: true, checkServerIdentity: () => undefined };
    case 'verify-full':
      return { rejectUnauthorized: true };
  }
}
