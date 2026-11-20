import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { databaseUrl, testAdminUrl } from '../../../test-utils/test-database';

export interface TestPostgresDatabase {
  /** Connection URL of the new, empty database. */
  readonly url: string;
  /** Drops the database (terminating connections still open to it). */
  drop(): Promise<void>;
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

/** Creates a uniquely named, empty database on the test server (TEST_DATABASE_URL, see test-utils/test-database). */
export async function createTestPostgresDatabase(label = 'plugin_storage'): Promise<TestPostgresDatabase> {
  const name = `att_${label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}_${randomBytes(6).toString('hex')}`;
  await withAdmin((client) => client.query(`CREATE DATABASE "${name}"`));
  return {
    url: databaseUrl(testAdminUrl(), name),
    drop: () =>
      withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).then(() => undefined)),
  };
}
