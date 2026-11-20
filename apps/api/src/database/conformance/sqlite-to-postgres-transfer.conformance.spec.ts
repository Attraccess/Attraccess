import type { DataSource } from 'typeorm';
import {
  createSqliteWorkspace,
  copyMigratedSqlite,
  disposeMigratedSqliteTemplate,
  type SqliteWorkspace,
} from '../transfer/sqlite-import.test-fixture';
import { compareSnapshots, rowCounts } from '../transfer/snapshot-compare.test-fixture';
import { exportSqliteSnapshot, transferSqliteToPostgres } from '../transfer/sqlite-to-postgres';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { PostgresBaseline1760000000000 } from '../postgres/migrations/1760000000000-baseline';
import { postgresBackend } from '../postgres/postgres-backend';
import { postgresIntegrityViolations } from '../postgres/postgres-transfer';
import { createSqliteSource } from '../sqlite/sqlite-source';
import type { DatabaseSnapshot, PluginDescriptor, SnapshotValue } from '../transfer-snapshot';
import { installSqliteTransferPlugin, populateSqliteDataset } from './sqlite-import-dataset.test-fixture';
import { TRANSFER_DATASET } from './transfer.conformance.test-fixture';
import { TRANSFER_PLUGIN, TRANSFER_PLUGIN_ROWS, TRANSFER_PLUGIN_TABLE } from './transfer-plugin.test-fixture';

jest.setTimeout(180_000);

const quiet = { log: () => undefined, warn: () => undefined };
const records = (snapshot: DatabaseSnapshot, name: string): Record<string, SnapshotValue>[] => {
  const table = snapshot.tables.find((candidate) => candidate.name === name);
  if (!table) throw new Error(`snapshot has no table ${name}`);
  return table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [column.name, row[index]])));
};

/**
 * The transfer contract across engines: the SQLite data set of the conformance suite, exported by the SQLite side of
 * the import path and imported into PostgreSQL. The same expectations hold as for a PostgreSQL to PostgreSQL restore.
 */
describe('SQLite to PostgreSQL transfer conformance', () => {
  let workspace: SqliteWorkspace;
  let plugin: PluginDescriptor;
  let sqliteSnapshot: DatabaseSnapshot;
  let target: DataSource;
  let pgSnapshot: DatabaseSnapshot;

  beforeAll(async () => {
    workspace = await createSqliteWorkspace();
    await copyMigratedSqlite(workspace.file);
    const sqlite = createSqliteSource(workspace.file);
    await sqlite.initialize();
    try {
      plugin = await installSqliteTransferPlugin(workspace.file, sqlite, TRANSFER_PLUGIN);
      await populateSqliteDataset(sqlite);
    } finally {
      await sqlite.destroy();
    }
    sqliteSnapshot = await exportSqliteSnapshot(workspace.file, [plugin], quiet);
    // At the baseline, the schema the SQLite data has: the comparison then covers every column. The migrations after
    // the baseline run on transferred data like on any upgraded database (postgres-migration-steps.persistence.spec).
    target = await createTestDataSource({ migrations: [PostgresBaseline1760000000000], migrationsRun: true });
    const url = (target.options as { url: string }).url;
    await transferSqliteToPostgres({
      sqliteFile: workspace.file,
      target,
      plugins: [plugin],
      targetPluginEngine: postgresBackend.plugins.createMigrationEngine({ type: 'postgres', url } as never),
      logger: quiet,
      markMigrated: false,
    });
    pgSnapshot = await postgresBackend.transfer.exportSnapshot(target, { plugins: [plugin] });
  });

  afterAll(async () => {
    await closeTestDataSource(target);
    await workspace?.remove();
    await disposeMigratedSqliteTemplate();
  });

  it('carries every table, column and row: the PostgreSQL export equals the SQLite export', () => {
    expect(compareSnapshots(sqliteSnapshot, pgSnapshot)).toEqual([]);
    const counts = rowCounts(pgSnapshot);
    expect(counts).toEqual(rowCounts(sqliteSnapshot));
    expect(counts.user).toBe(2);
    expect(counts.billing_transaction).toBe(4);
  });

  it('keeps every primary key, including gaps, and every reference between rows', () => {
    expect(records(pgSnapshot, 'user').map((user) => user.id)).toEqual(TRANSFER_DATASET.userIds);
    expect(records(pgSnapshot, 'resource_usage')[0]).toMatchObject({ id: 1, resourceId: 1, userId: 3 });
    expect(records(pgSnapshot, 'billing_transaction').find((tx) => tx.resourceUsageId === 1)).toMatchObject({
      userId: 3,
    });
  });

  it('continues generated ids after the highest id the SQLite source ever issued', async () => {
    const [{ id }] = await target.query(
      `INSERT INTO billing_transaction ("userId", amount, status) VALUES (3, 1, 'pending') RETURNING id`,
    );
    expect(id).toBe(TRANSFER_DATASET.highestIssuedTransactionId + 1);
  });

  it('keeps the instants of the SQLite text forms in UTC with millisecond precision', () => {
    const [usage] = records(pgSnapshot, 'resource_usage');
    expect(usage.startTime).toBe(TRANSFER_DATASET.usageStart);
    expect(usage.endTime).toBe(TRANSFER_DATASET.usageEnd);
    expect(records(pgSnapshot, 'resource_meter')[0].latestObservedAt).toBe(TRANSFER_DATASET.millisecondInstant);
  });

  it('keeps integers beyond double precision, exact decimals and non-ASCII text', () => {
    expect(records(pgSnapshot, 'user').find((user) => user.id === 1)?.creditBalance).toEqual({
      integer: TRANSFER_DATASET.hugeAmount,
    });
    const [meter] = records(pgSnapshot, 'resource_meter');
    expect(meter.lifetimeValue).toBe(TRANSFER_DATASET.meterLifetime);
    expect(meter.counterValue).toBe(TRANSFER_DATASET.meterCounter);
    expect(records(pgSnapshot, 'resource_metering_session')[0]).toMatchObject({
      baselineValue: '1000.000000001',
      consumedValue: '12.345678901',
    });
    expect(records(pgSnapshot, 'role').find((role) => role.key === 'administrator')?.description).toBe(
      TRANSFER_DATASET.adminDescription,
    );
  });

  it('does not apply balances a second time, and keeps the maintenance trigger active', async () => {
    expect(await postgresIntegrityViolations(target)).toEqual([]);
    const [{ before }] = await target.query(`SELECT "creditBalance"::text AS before FROM "user" WHERE id = 3`);
    await target.query(`INSERT INTO billing_transaction ("userId", amount, status) VALUES (3, 250, 'completed')`);
    const [{ after }] = await target.query(`SELECT "creditBalance"::text AS after FROM "user" WHERE id = 3`);
    expect(BigInt(after) - BigInt(before)).toBe(250n);
  });

  it('moves the plugin rows by their declaration and keeps the plugin storage versions', () => {
    expect(pgSnapshot.plugins).toEqual([
      {
        id: TRANSFER_PLUGIN.id,
        version: TRANSFER_PLUGIN.version,
        tables: [TRANSFER_PLUGIN_TABLE],
        storage: { namespace: 'demo_air_quality', versions: [1, 2] },
      },
    ]);
    const rows = records(pgSnapshot, TRANSFER_PLUGIN_TABLE);
    TRANSFER_PLUGIN_ROWS.forEach((row, index) => expect(rows[index]).toMatchObject(row.exported));
    expect(JSON.parse(String(rows[0].meta))).toEqual({ source: 'lab' });
  });

  it('leaves the foreign keys of the target valid', async () => {
    expect(await target.query('SELECT conname FROM pg_constraint WHERE NOT convalidated')).toEqual([]);
  });
});
