import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DataSource, DataSourceOptions } from 'typeorm';
import { compilePluginStorage } from '../../plugin-system/plugin-storage/storage-schema';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { resolveDatabaseBackend } from '../backend';
import {
  createSqlitePluginMigrationEngine,
  createSqlitePluginPersistenceHost,
} from '../sqlite/plugin-storage/sqlite-plugin-storage';
import type { PluginDescriptor } from '../transfer-snapshot';
import { TRANSFER_PLUGIN_ROWS, TRANSFER_PLUGIN_STORAGE } from './transfer-plugin.test-fixture';
import type { TransferBackendFixture, TransferDatabase } from './transfer-fixture';

/** One migrated database per test file: copying a closed file is much faster than running the whole track again. */
let template: Promise<{ directory: string; file: string }> | undefined;

async function migratedTemplate(): Promise<{ directory: string; file: string }> {
  template ??= (async () => {
    process.env.AUTH_SESSION_SECRET ||= 'transfer-conformance-secret';
    const directory = await mkdtemp(join(tmpdir(), 'transfer-template-'));
    const file = join(directory, 'attraccess.sqlite');
    const source = await createTestDataSource({ location: file });
    try {
      await source.runMigrations();
    } finally {
      await closeTestDataSource(source);
    }
    return { directory, file };
  })();
  return template;
}

const one = async <T>(source: DataSource, sql: string, params: unknown[] = []): Promise<T> =>
  (await source.query(sql, params))[0] as T;

async function openDatabase(): Promise<TransferDatabase> {
  const { file: templateFile } = await migratedTemplate();
  const directory = await mkdtemp(join(tmpdir(), 'transfer-db-'));
  const file = join(directory, 'attraccess.sqlite');
  await copyFile(templateFile, file);
  const source = await createTestDataSource({ location: file });
  const { transfer } = resolveDatabaseBackend();

  return {
    async populate() {
      await source.query(
        `INSERT INTO "user" (id, username, email) VALUES (1, 'zoe', 'zoe@example.com'), (3, 'yan', 'yan@example.com')`,
      );
      await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')");
      // Stored the ways SQLite sees them in the wild: with an offset, with milliseconds, and as datetime('now') does.
      await source.query(
        `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction, isFinalized,
          attributedOperatingDurationInMinutes, sessionDurationCreditsPerMinute, operatingDurationCreditsPerMinute)
          VALUES (1, 1, 3, '2026-03-29 01:30:00', '2026-03-29T05:15:00+02:00', 'usage', 1, 12.5, 3, 7)`,
      );
      await source.query(
        `INSERT INTO billing_transaction (id, userId, amount, status, resourceUsageId, externalReference) VALUES
          (1, 1, 9007199254740993, 'completed', NULL, 'huge'),
          (2, 1, 500, 'pending', NULL, 'not-yet'),
          (3, 3, 1000, 'completed', NULL, 'topup'),
          (4, 3, -105, 'completed', 1, NULL)`,
      );
      // A transaction that was issued and deleted again: the sequence keeps counting from it.
      await source.query("INSERT INTO billing_transaction (id, userId, amount, status) VALUES (99, 3, 1, 'pending')");
      await source.query('DELETE FROM billing_transaction WHERE id = 99');
      await source.query(
        `INSERT INTO resource_meter (id, resourceId, name, creditsPerUnit, lifetimeValue, counterValue, latestObservedAt)
          VALUES (1, 1, 'Energy (kWh)', 15, '123456789012345678901234567890.123456789', '0.1', '2026-06-01 12:00:00.123')`,
      );
      await source.query(
        `INSERT INTO resource_metering_session (id, resourceId, usageId, status, creditsPerUnit, baselineValue, source,
          latestValue, latestObservedAt, consumedValue, chargeCredits, meterId, collectionMode, meterName)
          VALUES ('session-1', 1, 1, 'settled', 15, '1000.000000001', 'grid', '1012.345678902', '2026-06-01 12:00:00',
          '12.345678901', 186, 1, 'requested', 'Energy (kWh)')`,
      );
      await source.query(
        `INSERT INTO audit_log (id, at, domain, action, operationId, actorId, outcome, subjectType, subjectId, details)
          VALUES (1, '2026-03-29 03:16:00', 'resource', 'resource.usage.end', 'op-1', 3, 'success', 'resource', 1, '{"usageId":1}')`,
      );
      await source.query("UPDATE role SET description = ? WHERE key = 'administrator'", [
        'Custom description (é, ü, 日本)',
      ]);
    },

    async installPlugin(plugin, withData): Promise<PluginDescriptor> {
      const { plugins } = resolveDatabaseBackend();
      const storage = compilePluginStorage(plugin.id, TRANSFER_PLUGIN_STORAGE, {
        reservedTables: plugins.coreTableNames(),
      });
      const engineOptions = { type: 'sqlite', database: file } as DataSourceOptions;
      await createSqlitePluginMigrationEngine(engineOptions, () => engineOptions).migrate(storage);
      if (withData) {
        const contexts = createSqlitePluginPersistenceHost(() => source).createContexts(plugin.id, storage);
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
      await source.query("INSERT INTO billing_transaction (userId, amount, status) VALUES (?, ?, 'completed')", [
        userId,
        amount,
      ]);
      const { id } = await one<{ id: number }>(source, 'SELECT last_insert_rowid() AS id');
      const { balance } = await one<{ balance: string }>(
        source,
        'SELECT CAST(creditBalance AS TEXT) AS balance FROM "user" WHERE id = ?',
        [userId],
      );
      return { id, balance };
    },

    async integrityViolations() {
      const problems: string[] = [];
      for (const violation of await source.query('PRAGMA foreign_key_check')) {
        problems.push(`foreign key: ${JSON.stringify(violation)}`);
      }
      const drift: { id: number; balance: string; expected: string }[] = await source.query(
        `SELECT u.id, CAST(u.creditBalance AS TEXT) AS balance,
            CAST(COALESCE(SUM(t.amount), 0) AS TEXT) AS expected
          FROM "user" u LEFT JOIN billing_transaction t ON t.userId = u.id AND t.status = 'completed'
          GROUP BY u.id HAVING balance != expected`,
      );
      for (const row of drift)
        problems.push(`balance of user ${row.id} is ${row.balance}, transactions say ${row.expected}`);
      return problems;
    },

    async close() {
      await closeTestDataSource(source);
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export const sqliteTransferFixture: TransferBackendFixture = {
  name: 'sqlite',
  create: openDatabase,
  async dispose() {
    const pending = template;
    template = undefined;
    if (pending) await rm((await pending).directory, { recursive: true, force: true });
  },
};
