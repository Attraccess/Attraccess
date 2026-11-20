import type { DataSource } from 'typeorm';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { postgresBackend } from '../postgres/postgres-backend';
import { postgresIntegrityViolations } from '../postgres/postgres-transfer';
import type { PluginDescriptor } from '../transfer-snapshot';
import { TRANSFER_PLUGIN_ROWS, TRANSFER_PLUGIN_STORAGE } from './transfer-plugin.test-fixture';
import type { TransferBackendFixture, TransferDatabase } from './transfer-fixture';

const one = async <T>(source: DataSource, sql: string, params: unknown[] = []): Promise<T> =>
  (await source.query(sql, params))[0] as T;

/** Tables the data set writes with explicit ids: their sequences are advanced the way an engine that issued them is. */
const SEQUENCED_TABLES = ['user', 'resource', 'resource_usage', 'billing_transaction', 'resource_meter', 'audit_log'];

/** The representative data set of the suite, written with PostgreSQL SQL (quoted camelCase names, $n parameters). */
export async function populateTransferDataset(source: DataSource): Promise<void> {
  await source.query(
    `INSERT INTO "user" (id, username, email) VALUES (1, 'zoe', 'zoe@example.com'), (3, 'yan', 'yan@example.com')`,
  );
  await source.query(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`);
  // The instants a client may send: with an offset, with milliseconds, naive (read as UTC by the session).
  await source.query(
    `INSERT INTO resource_usage (id, "resourceId", "userId", "startTime", "endTime", "usageAction", "isFinalized",
      "attributedOperatingDurationInMinutes", "sessionDurationCreditsPerMinute", "operatingDurationCreditsPerMinute")
      VALUES (1, 1, 3, '2026-03-29 01:30:00', '2026-03-29T05:15:00+02:00', 'usage', true, 12.5, 3, 7)`,
  );
  await source.query(
    `INSERT INTO billing_transaction (id, "userId", amount, status, "resourceUsageId", "externalReference") VALUES
      (1, 1, 9007199254740993, 'completed', NULL, 'huge'),
      (2, 1, 500, 'pending', NULL, 'not-yet'),
      (3, 3, 1000, 'completed', NULL, 'topup'),
      (4, 3, -105, 'completed', 1, NULL)`,
  );
  // A transaction that was issued and deleted again: the sequence keeps counting from it.
  await source.query(`INSERT INTO billing_transaction (id, "userId", amount, status) VALUES (99, 3, 1, 'pending')`);
  await source.query('DELETE FROM billing_transaction WHERE id = 99');
  await source.query(
    `INSERT INTO resource_meter (id, "resourceId", name, "creditsPerUnit", "lifetimeValue", "counterValue", "latestObservedAt")
      VALUES (1, 1, 'Energy (kWh)', 15, '123456789012345678901234567890.123456789', '0.1', '2026-06-01 12:00:00.123')`,
  );
  await source.query(
    `INSERT INTO resource_metering_session (id, "resourceId", "usageId", status, "creditsPerUnit", "baselineValue", source,
      "latestValue", "latestObservedAt", "consumedValue", "chargeCredits", "meterId", "collectionMode", "meterName")
      VALUES ('session-1', 1, 1, 'settled', 15, '1000.000000001', 'grid', '1012.345678902', '2026-06-01 12:00:00',
      '12.345678901', 186, 1, 'requested', 'Energy (kWh)')`,
  );
  await source.query(
    `INSERT INTO audit_log (id, at, domain, action, "operationId", "actorId", outcome, "subjectType", "subjectId", details)
      VALUES (1, '2026-03-29 03:16:00', 'resource', 'resource.usage.end', 'op-1', 3, 'success', 'resource', 1, '{"usageId":1}')`,
  );
  await source.query(`UPDATE role SET description = $1 WHERE key = 'administrator'`, [
    'Custom description (é, ü, 日本)',
  ]);
  for (const table of SEQUENCED_TABLES) {
    const floor = table === 'billing_transaction' ? 99 : 0;
    await source.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), GREATEST(COALESCE((SELECT MAX(id) FROM ${`"${table}"`}), 0), $2))`,
      [`"${table}"`, floor],
    );
  }
}

async function openDatabase(): Promise<TransferDatabase> {
  process.env.AUTH_SESSION_SECRET ||= 'transfer-conformance-secret';
  const source = await createTestDataSource();
  const { transfer } = postgresBackend;
  let location: string | undefined;

  return {
    populate: () => populateTransferDataset(source),

    async installPlugin(plugin, withData): Promise<PluginDescriptor> {
      location ??= (source.options as { url?: string }).url as string;
      const storage = compilePluginStorage(plugin.id, TRANSFER_PLUGIN_STORAGE, {
        reservedTables: postgresBackend.plugins.coreTableNames(),
      });
      await postgresBackend.plugins
        .createMigrationEngine({ type: 'postgres', url: location } as never)
        .migrate(storage);
      if (withData) {
        const contexts = postgresBackend.plugins.createPersistenceHost(() => source).createContexts(plugin.id, storage);
        const tables = contexts.storage.open(TRANSFER_PLUGIN_STORAGE) as never as {
          measurement: { insertMany(rows: unknown[]): Promise<unknown> };
        };
        await tables.measurement.insertMany(TRANSFER_PLUGIN_ROWS.map((row) => row.write));
      }
      return { ...plugin, storage };
    },

    exportSnapshot: (options) => transfer.exportSnapshot(source, options),
    importSnapshot: (snapshot, options) => transfer.importSnapshot(source, snapshot, options),

    async addTopUp(userId, amount) {
      const { id } = await one<{ id: number }>(
        source,
        `INSERT INTO billing_transaction ("userId", amount, status) VALUES ($1, $2, 'completed') RETURNING id`,
        [userId, amount],
      );
      const { balance } = await one<{ balance: string }>(
        source,
        'SELECT "creditBalance"::text AS balance FROM "user" WHERE id = $1',
        [userId],
      );
      return { id, balance };
    },

    async integrityViolations() {
      const problems = (await postgresIntegrityViolations(source)).map((problem) => `balance: ${problem}`);
      const unvalidated: { conname: string }[] = await source.query(
        'SELECT conname FROM pg_constraint WHERE NOT convalidated',
      );
      for (const { conname } of unvalidated) problems.push(`constraint ${conname} is not validated`);
      return problems;
    },

    close: () => closeTestDataSource(source),
  };
}

export const postgresTransferFixture: TransferBackendFixture = { name: 'postgres', create: openDatabase };
