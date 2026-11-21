import { Logger } from '@nestjs/common';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PostgresBaseline1760000000000 } from '../../database/postgres/migrations/1760000000000-baseline';
import { createSqliteSource } from '../../database/sqlite/sqlite-source';
import { disposeMigratedSqliteTemplate } from '../../database/sqlite/sqlite-import.test-fixture';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { olderStates } from './fixtures/older-states.test-fixture';
import {
  createLifecycleDatabase,
  recordedMigrations,
  trackMigrationNames,
  type LifecycleDatabase,
} from './fixtures/postgres-lifecycle.test-fixture';
import {
  compareWithSqlite,
  createOldInstallation,
  withStorageRoot,
  type OldInstallation,
} from './fixtures/sqlite-installation.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

const billingState = olderStates.find((state) =>
  state.name.startsWith('billing release'),
) as (typeof olderStates)[number];

async function onSqlite(file: string, ...statements: string[]): Promise<void> {
  const source = createSqliteSource(file);
  await source.initialize();
  try {
    for (const statement of statements) await source.query(statement);
  } finally {
    await source.destroy();
  }
}

/** Failure recovery: a failed import imports nothing and keeps the file; the next start retries and succeeds. */
describe('a SQLite import that fails', () => {
  let installation: OldInstallation;
  let lifecycle: LifecycleDatabase;
  let warn: jest.SpyInstance;

  /** One application start: the whole track with STORAGE_ROOT on the installation. */
  const start = async () => {
    const source = await lifecycle.open();
    return withStorageRoot(installation.storageRoot, () => source.runMigrations());
  };
  /** Users in PostgreSQL, on a fresh connection (it closes the previous one). */
  const users = async () => (await (await lifecycle.open()).query('SELECT COUNT(*)::int AS n FROM "user"'))[0].n;

  beforeEach(async () => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    installation = await createOldInstallation(billingState);
    lifecycle = await createLifecycleDatabase();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await lifecycle.close();
    await installation.remove();
  });

  it('rolls back on a broken foreign key, keeps the file in place and stops the later migrations; a retry succeeds', async () => {
    // A row that breaks a foreign key: possible in SQLite only with the checks off, as in a damaged file.
    await onSqlite(
      installation.file,
      'PRAGMA foreign_keys = OFF',
      `INSERT INTO billing_transaction_item (billingTransactionId, name, unitPrice, quantity) VALUES (9999, 'Orphan', 1, 1)`,
    );

    await expect(start()).rejects.toThrow(
      /Table billing_transaction_item breaks the foreign key \S+ \(references billing_transaction\).*"billingTransactionId":"9999"/,
    );

    const failed = await lifecycle.open();
    // 'each' mode: the baseline stays committed, the import and every later migration are still pending.
    expect(await recordedMigrations(failed)).toEqual(['PostgresBaseline1760000000000']);
    expect(await failed.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
    expect(await users()).toBe(0);
    expect(await readdir(installation.storageRoot)).toEqual(['attraccess.sqlite']);

    // The damage is repaired in the SQLite file; the next start imports everything.
    await onSqlite(installation.file, 'DELETE FROM billing_transaction_item WHERE billingTransactionId = 9999');
    expect((await start()).map((migration) => migration.name)).toEqual(trackMigrationNames().slice(1));
    const retried = await lifecycle.open();
    expect(await recordedMigrations(retried)).toEqual(trackMigrationNames());
    expect(await compareWithSqlite(retried, installation.backup)).toEqual([]);
    expect(await retried.query('SELECT "creditBalance" FROM "user" ORDER BY id')).toEqual([
      { creditBalance: 900 },
      { creditBalance: 250 },
    ]);
  });

  it('rolls back a failure in the middle of the copy, after other tables were filled', async () => {
    // A database at the baseline with a constraint one copied row violates: earlier tables are loaded when it fires.
    const baseline = await createTestDataSource({
      location: lifecycle.database.location,
      migrations: [PostgresBaseline1760000000000],
    });
    await baseline.runMigrations();
    await baseline.query(`ALTER TABLE billing_transaction_item ADD CONSTRAINT refuse_usage CHECK (name <> 'Usage')`);
    await closeTestDataSource(baseline);

    await expect(start()).rejects.toThrow(
      /Table billing_transaction_item, row id=\d+ cannot be stored: .*\(SQLSTATE 23514\), constraint refuse_usage/,
    );
    expect(await users()).toBe(0);
    expect(await readdir(installation.storageRoot)).toEqual(['attraccess.sqlite']);

    await (await lifecycle.open()).query('ALTER TABLE billing_transaction_item DROP CONSTRAINT refuse_usage');
    await start();
    expect(await users()).toBe(2);
  });

  it('only warns when the file cannot be moved after the commit, and records the import', async () => {
    // A file where the backup folder should be: the move fails.
    await writeFile(join(installation.storageRoot, 'sqlite-backup'), 'in the way');

    await start();

    expect(await recordedMigrations(await lifecycle.open())).toEqual(trackMigrationNames());
    expect(await users()).toBe(2);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/data is in PostgreSQL, but moving .* failed/));
    // The next start finds nothing pending: the file stays where it is, and nothing is imported again.
    expect(await start()).toEqual([]);
    expect(await users()).toBe(2);
  });
});
