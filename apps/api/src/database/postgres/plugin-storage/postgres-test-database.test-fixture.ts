import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

/** The server tests create their databases on (an admin connection); CI and the t3 worker provide one. */
export const TEST_DATABASE_ADMIN_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://attraccess:attraccess@127.0.0.1:55432/postgres';

export interface TestPostgresDatabase {
  /** Connection URL of the new, empty database. */
  readonly url: string;
  /** Drops the database (terminating connections still open to it). */
  drop(): Promise<void>;
}

async function withAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_ADMIN_URL });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Creates a uniquely named, empty database on the test server. */
export async function createTestPostgresDatabase(label = 'plugin_storage'): Promise<TestPostgresDatabase> {
  const name = `att_${label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_${randomBytes(6).toString('hex')}`;
  await withAdmin((client) => client.query(`CREATE DATABASE "${name}"`));
  const url = new URL(TEST_DATABASE_ADMIN_URL);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () =>
      withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).then(() => undefined)),
  };
}
