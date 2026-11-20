// Test helper for the operational script tests: one throw-away PostgreSQL database per test, created from the admin
// connection in TEST_DATABASE_URL (e.g. postgres://attraccess:attraccess@127.0.0.1:55432/postgres).
import { randomBytes } from 'node:crypto';
import pg from 'pg';

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL?.trim() || undefined;
/** Pass to node:test: the PostgreSQL tests are skipped (loudly) when no admin connection is configured. */
export const skipWithoutPostgres = TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set';

function withDatabase(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

/** Creates an empty database; `drop()` ends the connection and removes it. */
export async function createTestDatabase(prefix = 'attraccess_script_test') {
  const name = `${prefix}_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const url = withDatabase(TEST_DATABASE_URL, name);
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  return {
    name,
    url,
    db,
    async drop() {
      await db.end().catch(() => undefined);
      const cleanup = new pg.Client({ connectionString: TEST_DATABASE_URL });
      await cleanup.connect();
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
