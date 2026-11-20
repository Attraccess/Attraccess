import { ConfigModule } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from 'pg';
import { createTestDatabaseLocation, databaseUrl, testAdminUrl } from '../test-utils/test-database';

// The test server's admin URL: read before the caller's environment is cleaned out below, then handed on to the
// helper that creates the isolated database.
const databaseAdminUrl = testAdminUrl();

// Keep only host/tool variables. In particular, migrations must never seed real
// mail, payment, Balena, Redis or authentication credentials from the caller.
const hostVariables =
  /^(PATH|HOME|USER|LOGNAME|SHELL|TMPDIR|TMP|TEMP|LANG|LC_.*|TERM|NODE_.*|JEST_.*|NX_.*|CI|npm_.*)$/;
for (const key of Object.keys(process.env)) {
  if (!hostVariables.test(key)) delete process.env[key];
}
export const storageRoot = mkdtempSync(join(tmpdir(), 'attractap-real-api-storage-'));
process.env.TEST_DATABASE_URL = databaseAdminUrl;
process.env.STORAGE_ROOT = storageRoot;
// The API reads its connection URL when its modules load, before a spec can create anything: the database name is
// chosen here and the database itself is created by `provisionDatabase` before the API starts.
const databaseName = `att_real_api_${process.pid}_${randomBytes(4).toString('hex')}`;
process.env.DATABASE_URL = databaseUrl(databaseAdminUrl, databaseName);
process.env.DATABASE_TYPE = 'postgres';
process.env.PLUGIN_DIR = join(storageRoot, 'plugins');
mkdirSync(process.env.PLUGIN_DIR);
process.env.DISABLE_PLUGINS = 'true';
process.env.AUTH_SESSION_SECRET = randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.LOG_LEVELS = 'error,warn';
process.env.ATTRACCESS_URL = 'http://127.0.0.1';

// Exercise the real configuration factories, but never import the developer's
// .env file (including in bootstrap's early plugin configuration context).
const forRoot = ConfigModule.forRoot.bind(ConfigModule);
jest.spyOn(ConfigModule, 'forRoot').mockImplementation((options) => forRoot({ ...options, ignoreEnvFile: true }));

async function withAdmin<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseAdminUrl });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

let provisioned = false;

/** Creates the isolated PostgreSQL database (a migrated copy) the API of this suite runs on. */
export async function provisionDatabase(): Promise<void> {
  const copy = await createTestDatabaseLocation();
  await withAdmin((admin) => admin.query(`ALTER DATABASE "${copy.name}" RENAME TO "${databaseName}"`));
  provisioned = true;
}

// The suite closes Nest/DataSource before invoking this registered owner cleanup.
export async function disposeStorage(): Promise<void> {
  rmSync(storageRoot, { recursive: true, force: true });
  if (provisioned) {
    provisioned = false;
    await withAdmin((admin) => admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
  }
}
