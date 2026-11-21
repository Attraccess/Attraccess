import { createHash, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { resolveDatabaseBackend } from '../database/backend';
import { POSTGRES_MIGRATIONS_TRANSACTION_MODE } from '../database/postgres/postgres-backend';
import { postgresConnectionOptions } from '../database/postgres/postgres-connection';

/**
 * The one place tests open a real database. It goes through the DatabaseBackend seam, so a spec runs on the
 * application's own connection rules. Every call gets a database of its own on the test server (TEST_DATABASE_URL,
 * an administrative connection URL), created from a migrated template and dropped again by `closeTestDataSource`
 * (or `TestDatabaseLocation.remove`), so specs stay isolated and parallel-safe across Jest workers.
 * Specs must not hand-build `new DataSource({ type: 'postgres', ... })`.
 */
export interface TestDatabaseOptions {
  /**
   * Connection URL of an existing test database (from `createTestDatabaseLocation`), for specs that reopen the same
   * database through independent connections. Defaults to a private new database.
   */
  location?: string;
  /** Entity classes to map. Defaults to the backend's complete entity set. */
  entities?: unknown[];
  /** Migrations to know about. Defaults to the backend's released track. */
  migrations?: readonly unknown[];
  /** Creates the schema from the entities instead of running migrations (fast specs that do not test migrations). */
  synchronize?: boolean;
  /** Name of the table that records the applied migrations (plugins keep their own). Defaults to the track's. */
  migrationsTableName?: string;
  /** Runs the migration track on `initialize()`. Off by default: the database starts at the current release. */
  migrationsRun?: boolean;
  /** The new database starts empty (no schema) instead of at the current release. */
  empty?: boolean;
}

const DEFAULT_ADMIN_URL = 'postgres://attraccess:attraccess@127.0.0.1:5432/postgres';

export function testAdminUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.TEST_DATABASE_URL || env.DATABASE_URL || DEFAULT_ADMIN_URL;
}

/** The URL of another database on the same server as `baseUrl`. */
export function databaseUrl(baseUrl: string, database: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testAdminUrl() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

const quoteIdent = (name: string) => `"${name.replace(/"/g, '""')}"`;

function feed(directory: string, hash: ReturnType<typeof createHash>): void {
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) feed(path, hash);
    else hash.update(entry).update(readFileSync(path));
  }
}

function fingerprint(directory: string): string {
  const hash = createHash('sha1');
  feed(directory, hash);
  return hash.digest('hex').slice(0, 12);
}

let templateName: Promise<string> | undefined;

/** The migrated template database: created once per server and migration track version, by whichever worker is first. */
function migratedTemplate(): Promise<string> {
  templateName ??= (async () => {
    const backend = resolveDatabaseBackend();
    const name = `att_tpl_${fingerprint(join(__dirname, '..', 'database', 'postgres', 'migrations'))}`;
    const adminUrl = testAdminUrl();
    await withAdmin(async (admin) => {
      await admin.query('SELECT pg_advisory_lock(584001)');
      try {
        const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
        if (exists.rowCount) return;
        const building = `${name}_building`;
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(building)}`);
        await admin.query(`CREATE DATABASE ${quoteIdent(building)}`);
        const source = backend.createDataSource({
          ...postgresConnectionOptions({
            url: databaseUrl(adminUrl, building),
            ssl: 'off',
            poolMax: 2,
            schema: 'public',
          }),
          entities: [],
          migrations: [...backend.migrationTrack.migrations],
          migrationsTableName: backend.migrationTrack.tableName,
          migrationsTransactionMode: POSTGRES_MIGRATIONS_TRANSACTION_MODE,
          migrationsRun: false,
        } as DataSourceOptions);
        await source.initialize();
        try {
          await source.runMigrations();
        } finally {
          await source.destroy();
        }
        await admin.query(`ALTER DATABASE ${quoteIdent(building)} RENAME TO ${quoteIdent(name)}`);
      } finally {
        await admin.query('SELECT pg_advisory_unlock(584001)');
      }
    });
    return name;
  })();
  return templateName;
}

const owned = new WeakMap<DataSource, string>();

/** Creates a database and returns its connection URL. */
async function createDatabase(empty: boolean): Promise<{ name: string; url: string }> {
  const name = `att_t_${process.pid}_${randomBytes(4).toString('hex')}`;
  const template = empty ? undefined : await migratedTemplate();
  await withAdmin(async (admin) => {
    // CREATE DATABASE ... TEMPLATE needs the template idle; concurrent clones of one template serialise here.
    await admin.query('SELECT pg_advisory_lock(584002)');
    try {
      await admin.query(`CREATE DATABASE ${quoteIdent(name)}${template ? ` TEMPLATE ${quoteIdent(template)}` : ''}`);
    } finally {
      await admin.query('SELECT pg_advisory_unlock(584002)');
    }
  });
  return { name, url: databaseUrl(testAdminUrl(), name) };
}

async function dropDatabase(name: string): Promise<void> {
  await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`));
}

export function createTestDataSourceOptions(options: TestDatabaseOptions = {}): DataSourceOptions {
  const backend = resolveDatabaseBackend();
  const url = options.location ?? testAdminUrl();
  return {
    ...postgresConnectionOptions({ url, ssl: 'off', poolMax: 4, schema: 'public' }),
    entities: options.entities ?? backend.entities,
    migrations: [...(options.migrations ?? backend.migrationTrack.migrations)],
    synchronize: options.synchronize ?? false,
    migrationsRun: options.migrationsRun ?? false,
    migrationsTableName: options.migrationsTableName ?? backend.migrationTrack.tableName,
    migrationsTransactionMode: POSTGRES_MIGRATIONS_TRANSACTION_MODE,
  } as DataSourceOptions;
}

/**
 * Opens a test database through the backend's connection factory. Without `location` it is a new private database at
 * the current release (cloned from the migrated template; empty when the spec synchronises its own entities or brings
 * its own migrations). The caller owns `closeTestDataSource`, which drops a database created here.
 */
export async function createTestDataSource(options: TestDatabaseOptions = {}): Promise<DataSource> {
  const backend = resolveDatabaseBackend();
  let created: { name: string; url: string } | undefined;
  let location = options.location;
  if (!location) {
    const custom = options.synchronize === true || options.migrations !== undefined || options.empty === true;
    created = await createDatabase(custom);
    location = created.url;
  }
  const source = backend.createDataSource(createTestDataSourceOptions({ ...options, location }));
  try {
    await source.initialize();
  } catch (error) {
    if (created) await dropDatabase(created.name);
    throw error;
  }
  if (created) owned.set(source, created.name);
  return source;
}

/** Releases the DataSource and drops the database it created. Safe to call twice. */
export async function closeTestDataSource(source: DataSource | undefined): Promise<void> {
  if (!source) return;
  await resolveDatabaseBackend().shutdown(source);
  if (source.isInitialized) await source.destroy();
  const name = owned.get(source);
  if (name) {
    owned.delete(source);
    await dropDatabase(name);
  }
}

export interface TestDatabaseLocation {
  /** The connection URL of the database, for `createTestDataSource({ location })`. */
  readonly location: string;
  /** The database name. */
  readonly name: string;
  remove(): Promise<void>;
}

/** A database for specs that open several independent connections to the same data. Dropped by `remove()`. */
export async function createTestDatabaseLocation(options: { empty?: boolean } = {}): Promise<TestDatabaseLocation> {
  const { name, url } = await createDatabase(options.empty ?? false);
  return { name, location: url, remove: () => dropDatabase(name) };
}
