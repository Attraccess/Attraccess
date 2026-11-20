import { postgresBackend } from '../../database/postgres/postgres-backend';
import { postgresHasUserData } from '../../database/transfer/startup-transfer';
import { createSqliteSource } from '../../database/sqlite/sqlite-source';
import { disposeMigratedSqliteTemplate } from '../../database/transfer/sqlite-import.test-fixture';
import { compareSnapshots, rowCounts } from '../../database/transfer/snapshot-compare.test-fixture';
import { olderStates } from './fixtures/older-states.test-fixture';
import {
  createOldInstallation,
  createPostgresTarget,
  sha256,
  type OldInstallation,
  type PostgresTarget,
} from './fixtures/sqlite-transfer.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

const billingState = olderStates.find((state) =>
  state.name.startsWith('billing release'),
) as (typeof olderStates)[number];

/** Writes a row that breaks a foreign key into the SQLite file: possible only with the checks off, as in a damaged file. */
async function addOrphan(file: string): Promise<void> {
  const source = createSqliteSource(file);
  await source.initialize();
  try {
    await source.query('PRAGMA foreign_keys = OFF');
    await source.query(
      `INSERT INTO billing_transaction_item (billingTransactionId, name, unitPrice, quantity) VALUES (9999, 'Orphan', 1, 1)`,
    );
  } finally {
    await source.destroy();
  }
}

async function removeOrphan(file: string): Promise<void> {
  const source = createSqliteSource(file);
  await source.initialize();
  try {
    await source.query('DELETE FROM billing_transaction_item WHERE billingTransactionId = 9999');
  } finally {
    await source.destroy();
  }
}

/** Failure recovery: a broken transfer changes nothing, a retry after the fix completes it. */
describe('a SQLite to PostgreSQL transfer that fails', () => {
  let installation: OldInstallation;
  let target: PostgresTarget;

  beforeEach(async () => {
    installation = await createOldInstallation(billingState);
    target = await createPostgresTarget();
  });

  afterEach(async () => {
    await target.close();
    await installation.workspace.remove();
  });

  it('leaves PostgreSQL with the baseline only and the SQLite file byte for byte untouched, and a retry succeeds', async () => {
    await addOrphan(installation.workspace.file);
    const emptyTarget = await postgresBackend.transfer.exportSnapshot(target.source);
    const before = await sha256(installation.workspace.file);

    await expect(target.transfer(installation)).rejects.toThrow(/SQLite file is untouched/);

    expect(await sha256(installation.workspace.file)).toBe(before);
    expect(await postgresHasUserData(target.source)).toBe(false);
    const afterFailure = await postgresBackend.transfer.exportSnapshot(target.source);
    expect(afterFailure).toEqual(emptyTarget);
    expect(Object.values(rowCounts(afterFailure)).reduce((sum, count) => sum + count, 0)).toBe(
      Object.values(rowCounts(emptyTarget)).reduce((sum, count) => sum + count, 0),
    );
    expect(await target.source.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);

    // The damage is repaired in the SQLite file; the next attempt moves everything.
    await removeOrphan(installation.workspace.file);
    const summary = await target.transfer(installation);
    expect(summary.totalRows).toBeGreaterThan(0);
    expect(await postgresHasUserData(target.source)).toBe(true);
    const imported = await postgresBackend.transfer.exportSnapshot(target.source);
    expect(compareSnapshots(summary.snapshot, imported)).toEqual([]);
    expect(await target.source.query('SELECT "creditBalance" FROM "user" ORDER BY id')).toEqual([
      { creditBalance: 900 },
      { creditBalance: 250 },
    ]);
  });

  it('rolls back a failure in the middle of the import, after other tables were copied', async () => {
    // A constraint of the target that one copied row violates: the tables before it are already loaded when it fires.
    await target.source.query(
      `ALTER TABLE billing_transaction_item ADD CONSTRAINT refuse_usage CHECK (name <> 'Usage')`,
    );
    const emptyTarget = await postgresBackend.transfer.exportSnapshot(target.source);
    const before = await sha256(installation.workspace.file);

    await expect(target.transfer(installation)).rejects.toThrow(/cannot be imported/);

    expect(await sha256(installation.workspace.file)).toBe(before);
    expect(await postgresHasUserData(target.source)).toBe(false);
    expect(await postgresBackend.transfer.exportSnapshot(target.source)).toEqual(emptyTarget);
    expect(await target.source.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);

    await target.source.query('ALTER TABLE billing_transaction_item DROP CONSTRAINT refuse_usage');
    const summary = await target.transfer(installation);
    expect(summary.totalRows).toBeGreaterThan(0);
    expect(rowCounts(await postgresBackend.transfer.exportSnapshot(target.source)).user).toBe(2);
  });
});
