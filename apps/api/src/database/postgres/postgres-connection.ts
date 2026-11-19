import { Logger } from '@nestjs/common';
import { Client, types } from 'pg';
import { DataSource, DataSourceOptions } from 'typeorm';
import { parsePostgresConfig, sslOption, type PostgresConfig } from './postgres-config';

const logger = new Logger('PostgresConnection');

/** Statement and lock waits are bounded so a stuck transaction shows up as a retryable error, not a hang. */
export const POSTGRES_LOCK_TIMEOUT_MS = 10_000;
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 120_000;
/**
 * How long a query waits for a pooled connection (pool exhausted) or for a new connection to be established. Unset,
 * pg waits forever and every request, session authentication included, hangs while the pool is used up. Past it,
 * pg-pool rejects with an error the classifier reports as busy (503); a new connection that does not come up in time
 * fails with "Connection terminated due to connection timeout", which the startup retry treats as transient.
 */
export const POSTGRES_CONNECT_TIMEOUT_MS = 10_000;

let parsersInstalled = false;

/**
 * pg returns bigint (int8: COUNT, SUM, bigint columns) as strings. Every bigint the application reads is a count or
 * an id well inside 2^53; a value beyond it fails loudly instead of losing precision. numeric stays a string (exact).
 */
export function installPostgresTypeParsers(): void {
  if (parsersInstalled) return;
  parsersInstalled = true;
  types.setTypeParser(types.builtins.INT8, (text: string) => {
    const value = Number(text);
    if (!Number.isSafeInteger(value)) throw new RangeError('A bigint value exceeds the safe integer range');
    return value;
  });
}

/** TypeORM options for one connection (pool, SSL, UTC session, lock timeouts). Entities and migrations are the caller's. */
export function postgresConnectionOptions(config: PostgresConfig = parsePostgresConfig()): DataSourceOptions {
  installPostgresTypeParsers();
  return {
    type: 'postgres',
    url: config.url,
    schema: config.schema,
    ssl: sslOption(config.ssl),
    // TypeORM passes it to pg as `connectionTimeoutMillis`.
    connectTimeoutMS: POSTGRES_CONNECT_TIMEOUT_MS,
    synchronize: false,
    // gen_random_uuid() is built in since PostgreSQL 13: no extension has to be installed (or be installable).
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    // TypeORM 1.0 throws on null/undefined values in find-option where clauses; 0.3 skipped them. Keep 0.3's behaviour
    // so code that passes an optional filter does not start failing at runtime.
    invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' },
    extra: {
      max: config.poolMax,
      application_name: 'attraccess',
      options:
        `-c timezone=UTC -c lock_timeout=${POSTGRES_LOCK_TIMEOUT_MS} ` +
        `-c idle_in_transaction_session_timeout=${IDLE_IN_TRANSACTION_TIMEOUT_MS} ` +
        // The baseline migration, its triggers and the plugin storage DDL use unqualified names: the search_path
        // decides which schema they land in. The schema is a validated identifier, quoted to keep its case.
        `-c search_path="${config.schema}"`,
    },
  } as DataSourceOptions;
}

export function createDataSource(options: DataSourceOptions): DataSource {
  installPostgresTypeParsers();
  return new DataSource({ invalidWhereValuesBehavior: { null: 'ignore', undefined: 'ignore' }, ...options });
}

const STARTUP_ATTEMPTS = 30;

/**
 * Opens the connection, retrying while PostgreSQL starts (balena has no healthy-condition depends_on): bounded
 * exponential backoff, one log line per attempt, never the URL.
 */
export async function initializeWithRetry(
  source: DataSource,
  { attempts = STARTUP_ATTEMPTS, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<DataSource> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await source.initialize();
    } catch (error) {
      const code = (error as { code?: string }).code ?? (error as Error).name;
      if (attempt >= attempts || !isStartupTransient(error)) throw error;
      const delay = Math.min(5000, 250 * 2 ** (attempt - 1));
      logger.warn(
        `PostgreSQL is not reachable yet (${code}); retrying in ${delay} ms (attempt ${attempt}/${attempts})`,
      );
      await sleep(delay);
    }
  }
}

function isStartupTransient(error: unknown): boolean {
  const code =
    (error as { code?: string; driverError?: { code?: string } })?.code ??
    (error as { driverError?: { code?: string } })?.driverError?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === '57P03' || // the database system is starting up
    code === '53300' ||
    // A published port (docker-proxy, a load balancer) accepts the TCP connection before PostgreSQL listens and then
    // drops it; node-postgres reports that, and its own connect timeout, without an error code.
    /Connection terminated (unexpectedly|due to connection timeout)/.test((error as Error | undefined)?.message ?? '')
  );
}

export interface WaitOptions {
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
  connect?: (config: PostgresConfig) => Promise<void>;
}

async function probe(config: PostgresConfig): Promise<void> {
  const client = new Client({
    connectionString: config.url,
    ssl: sslOption(config.ssl),
    connectionTimeoutMillis: 5000,
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    await ensureSchema(client, config.schema);
  } finally {
    await client.end();
  }
}

/** DATABASE_SCHEMA other than `public` is created when missing (the role needs CREATE on the database then). */
async function ensureSchema(client: Client, schema: string): Promise<void> {
  if (schema === 'public') return;
  const { rowCount } = await client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema]);
  if (rowCount) return;
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  logger.log(`Created the database schema "${schema}"`);
}

/**
 * Waits until PostgreSQL accepts connections (it may still be starting: balena allows no healthy-condition
 * depends_on). Bounded exponential backoff, one log line per attempt, never the URL. Other failures (wrong password,
 * missing database) are not retried: they are configuration errors.
 */
export async function waitForPostgres(
  config: PostgresConfig,
  {
    attempts = STARTUP_ATTEMPTS,
    sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)),
    connect = probe,
  }: WaitOptions = {},
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await connect(config);
      return;
    } catch (error) {
      const code = (error as { code?: string }).code ?? (error as Error).name;
      if (attempt >= attempts || !isStartupTransient(error)) throw error;
      const delay = Math.min(5000, 250 * 2 ** (attempt - 1));
      logger.warn(
        `PostgreSQL is not reachable yet (${code}); retrying in ${delay} ms (attempt ${attempt}/${attempts})`,
      );
      await sleep(delay);
    }
  }
}
