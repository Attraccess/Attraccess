import { postgresBackend } from '../../database/postgres/postgres-backend';
import { postgresIntegrityViolations } from '../../database/postgres/postgres-transfer';
import { disposeMigratedSqliteTemplate } from '../../database/transfer/sqlite-import.test-fixture';
import { columnsAddedAfterBaseline } from '../../database/postgres/migrations-after-baseline.test-fixture';
import { compareSnapshots, rowCounts } from '../../database/transfer/snapshot-compare.test-fixture';
import type { DatabaseSnapshot } from '../../database/transfer-snapshot';
import { olderStates } from './fixtures/older-states.test-fixture';
import { postgresExpectations } from './fixtures/older-states-postgres.test-fixture';
import { recordedMigrations, trackMigrationNames } from './fixtures/postgres-lifecycle.test-fixture';
import {
  createOldInstallation,
  createPostgresTarget,
  sha256,
  type CapturedTransfer,
  type OldInstallation,
  type PostgresTarget,
} from './fixtures/sqlite-transfer.test-fixture';

jest.setTimeout(600_000);

afterAll(disposeMigratedSqliteTemplate);

/**
 * The upgrade path of a SQLite installation: the database of each older release (its schema exactly as that release
 * created it, with the data that release wrote) moves into PostgreSQL. The final state of the SQLite data, after the
 * frozen migrations ran on a private copy, is compared with what PostgreSQL holds, table by table.
 */
describe.each(olderStates)('transfer of the SQLite database of the $name', (state) => {
  let installation: OldInstallation;
  let target: PostgresTarget;
  let summary: CapturedTransfer;
  let before: string;
  let finalSqlite: DatabaseSnapshot;
  let imported: DatabaseSnapshot;
  let added: Map<string, string[]>;

  beforeAll(async () => {
    installation = await createOldInstallation(state);
    before = await sha256(installation.workspace.file);
    target = await createPostgresTarget();
    summary = await target.transfer(installation);
    finalSqlite = summary.snapshot;
    imported = await postgresBackend.transfer.exportSnapshot(target.source, { plugins: installation.plugins });
    added = await columnsAddedAfterBaseline();
  });

  afterAll(async () => {
    await target?.close();
    await installation?.workspace.remove();
  });

  it('carries every table, column and row of the final SQLite state into PostgreSQL', () => {
    expect(compareSnapshots(finalSqlite, imported, added)).toEqual([]);
    expect(rowCounts(imported)).toEqual(rowCounts(finalSqlite));
    const nonEmpty = Object.entries(rowCounts(finalSqlite)).filter(([, count]) => count > 0);
    expect(nonEmpty.length).toBeGreaterThan(2);
    expect(summary.totalRows).toBe(nonEmpty.reduce((sum, [, count]) => sum + count, 0));
    expect(summary.warnings).toEqual([]);
  });

  it('leaves the SQLite file byte for byte as it was and the PostgreSQL track at its own baseline', async () => {
    expect(await sha256(installation.workspace.file)).toBe(before);
    expect(await recordedMigrations(target.source)).toEqual(trackMigrationNames());
  });

  it('keeps foreign keys valid and balances equal to the completed transactions', async () => {
    expect(await target.source.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
    expect(await postgresIntegrityViolations(target.source)).toEqual([]);
  });

  it('continues generated ids after the highest id of the source in every table', () => {
    for (const [table, issued] of Object.entries(finalSqlite.sequences)) {
      if (!(table in rowCounts(imported))) continue;
      expect([table, imported.sequences[table] ?? 0]).toEqual([table, expect.any(Number)]);
      expect(imported.sequences[table] ?? 0).toBeGreaterThanOrEqual(issued);
    }
  });

  it('holds the data of that release with its types in PostgreSQL', async () => {
    await postgresExpectations[state.name](target.source);
  });
});
