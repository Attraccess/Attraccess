import fs from 'fs';
import * as os from 'os';
import path from 'path';

const testStorageRoot = process.env.TEST_STORAGE_ROOT
  ? path.resolve(process.env.TEST_STORAGE_ROOT)
  : fs.mkdtempSync(path.join(os.tmpdir(), `attraccess-api-test-${process.env.JEST_WORKER_ID ?? '0'}-`));

process.env.STORAGE_ROOT = testStorageRoot;
// PostgreSQL is the only database: code that resolves the backend needs a connection URL. Specs open their databases
// through test-utils/test-database (private databases on the TEST_DATABASE_URL server); this only satisfies config.
// It names a database that does not exist, so a spec that forgot its own database fails instead of writing to the
// admin database.
const unsetTestDatabaseUrl = new URL(
  process.env.TEST_DATABASE_URL ?? 'postgres://attraccess:attraccess@127.0.0.1:5432/postgres',
);
unsetTestDatabaseUrl.pathname = '/attraccess_unset_test_database';
process.env.DATABASE_URL ??= unsetTestDatabaseUrl.toString();

fs.rmSync(testStorageRoot, { recursive: true, force: true });
fs.mkdirSync(testStorageRoot, { recursive: true });

// Application code interprets driver errors through the active backend's classifier (see database/backend). Only the
// classifier is registered here: resolving the whole backend would load every entity and migration for each test file.
require('../database/persistence-errors').registerPersistenceErrorClassifier(
  require('../database/postgres/postgres-errors').postgresErrorClassifier,
);

// TypeORM drops explicit auto-increment ids from PostgreSQL inserts; specs rely on setting them.
require('./explicit-primary-keys');
