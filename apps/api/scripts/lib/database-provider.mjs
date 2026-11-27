// The database provider of the operational scripts (dev seed, re-encryption) and the setup scripts.
//
// Plain Node only: the production image has no TypeScript sources and only ships this folder beside the script, so
// nothing here may import a .ts file. The only dependency is the `pg` driver the deployed API package ships.
// PostgreSQL is the only runtime database: DATABASE_TYPE may be unset or `postgres`, and DATABASE_URL names it.

export const DEFAULT_DATABASE_TYPE = 'postgres';

/** Only a plain identifier is echoed: a misplaced connection string must not reach logs. */
function describe(value) {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value) ? `"${value}"` : '(redacted: not a database type name)';
}

/** Turns `?` placeholders into `$1, $2, ...` (a `?` inside a quoted literal or identifier is left alone). */
export function toPositionalParameters(sql) {
  let index = 0;
  let quote = null;
  let out = '';
  for (const char of sql) {
    if (quote) {
      if (char === quote) quote = null;
      out += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      out += char;
    } else if (char === '?') {
      out += `$${++index}`;
    } else {
      out += char;
    }
  }
  return out;
}

// DATABASE_SSL exactly as the API reads it (apps/api/src/database/postgres/postgres-config.ts, parseSsl and
// sslOption). A copy, because this folder may not import TypeScript: change both together.
const SSL_MODES = ['off', 'require', 'verify-ca', 'verify-full'];
const SSL_ALIASES = { '': 'off', false: 'off', 0: 'off', disable: 'off', true: 'require', 1: 'require' };
const SSL_OPTIONS = {
  off: undefined,
  // Encrypted, the certificate is not verified.
  require: { rejectUnauthorized: false },
  // The chain is verified, the host name on the certificate is not.
  'verify-ca': { rejectUnauthorized: true, checkServerIdentity: () => undefined },
  'verify-full': { rejectUnauthorized: true },
};

/** The pg `ssl` option for DATABASE_SSL (undefined = no TLS). Throws for a value the API would refuse. */
export function resolveSsl(env = process.env) {
  const raw = (env.DATABASE_SSL ?? '').trim().toLowerCase();
  const mode = Object.hasOwn(SSL_ALIASES, raw) ? SSL_ALIASES[raw] : raw;
  if (!SSL_MODES.includes(mode)) {
    throw new Error(`DATABASE_SSL must be one of ${SSL_MODES.join(', ')} (value not shown).`);
  }
  return SSL_OPTIONS[mode];
}

/** Host and database name of a connection URL, without credentials. */
export function describeLocation(url) {
  try {
    const parsed = new URL(url);
    return { host: parsed.hostname, database: decodeURIComponent(parsed.pathname.replace(/^\//, '')) };
  } catch {
    throw new Error(
      'DATABASE_URL is not a valid connection URL (expected postgres://user:password@host:5432/database)',
    );
  }
}

export function isLocalHost(host) {
  return ['localhost', '127.0.0.1', '::1', '[::1]', ''].includes(host) || host.startsWith('/');
}

/**
 * PostgreSQL through `pg`. The location is a connection URL; a handle is a connected pg Client. Statements use `?`
 * placeholders (converted to `$n`) so callers keep one shape; `run` resolves to `{ lastID, changes }` where lastID is
 * the `id` of the first row when the statement ends in `RETURNING id`. camelCase identifiers must be quoted.
 */
export const postgresProvider = {
  type: 'postgres',
  /** The connection URL from DATABASE_URL (required). */
  defaultLocation(env = process.env) {
    const url = env.DATABASE_URL?.trim();
    if (!url) throw new Error('DATABASE_URL is required (postgres://user:password@host:5432/database)');
    return url;
  },
  async open(location, env = process.env) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: location, ssl: resolveSsl(env) });
    await client.connect();
    const schema = env.DATABASE_SCHEMA?.trim();
    if (schema) {
      await client.query('SELECT set_config($1, $2, false)', ['search_path', `"${schema.split('"').join('""')}"`]);
    }
    return client;
  },
  async close(db) {
    await db.end();
  },
  async run(db, sql, params = []) {
    const result = await db.query(toPositionalParameters(sql), params);
    const first = result.rows[0];
    return { lastID: first && 'id' in first ? Number(first.id) : undefined, changes: result.rowCount ?? 0 };
  },
  async get(db, sql, params = []) {
    return (await db.query(toPositionalParameters(sql), params)).rows[0];
  },
  async all(db, sql, params = []) {
    return (await db.query(toPositionalParameters(sql), params)).rows;
  },
  async begin(db) {
    await db.query('BEGIN');
  },
  async commit(db) {
    await db.query('COMMIT');
  },
  async rollback(db) {
    await db.query('ROLLBACK');
  },
  async hasTable(db, table) {
    const result = await db.query(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1',
      [table],
    );
    return result.rows.length > 0;
  },
  async columns(db, table) {
    const result = await db.query(
      'SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position',
      [table],
    );
    return result.rows.map((row) => row.column_name);
  },
};

const PROVIDERS = { postgres: postgresProvider };
export const SUPPORTED_DATABASE_TYPES = Object.keys(PROVIDERS);

/** Throws before any database is touched when DATABASE_TYPE is not supported. */
export function parseDatabaseType(env = process.env) {
  const raw = env.DATABASE_TYPE?.trim();
  if (!raw) return DEFAULT_DATABASE_TYPE;
  const normalized = raw.toLowerCase();
  if (Object.hasOwn(PROVIDERS, normalized)) return normalized;
  throw new Error(
    `Unsupported DATABASE_TYPE ${describe(raw)}. Supported values: ${SUPPORTED_DATABASE_TYPES.join(', ')}.`,
  );
}

export function resolveDatabaseProvider(env = process.env) {
  return PROVIDERS[parseDatabaseType(env)];
}

// Used by the shell setup scripts: `node database-provider.mjs` validates DATABASE_TYPE and prints the type.
if (import.meta.main) {
  try {
    process.stdout.write(`${parseDatabaseType(process.env)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
