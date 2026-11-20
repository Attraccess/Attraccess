import type { DataSource } from 'typeorm';
import { definePluginStorage, f, step, table } from '@attraccess/plugins-backend-sdk';
import { postgresBackend } from '../../../database/postgres/postgres-backend';
import { createSqlitePluginMigrationEngine } from '../../../database/sqlite/sqlite-plugin-migrations';
import type { PluginDescriptor } from '../../../database/transfer-snapshot';
import { compilePluginStorage } from '../../../plugin-system/plugin-storage/storage-schema';
import type { OlderState } from './older-state.test-fixture';

/**
 * A deployment stopped in the middle of work, before parallel machine sessions: a running session (no end time), a
 * start that was reserved but not yet published (with its lifecycle attempt), a session that restart recovery had
 * cancelled (with its recovery journal row), and an installed plugin with its own migration table and data.
 */
export const openWorkRelease: OlderState = {
  name: 'release with open work (running session, pending start, recovery journal, plugin tables)',
  timestamp: 1791900000000,
  async seed(source) {
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES (1, 'hank', 'hank@example.com'), (2, 'ivy', 'ivy@example.com')`,
    );
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Router', 'machine'), (2, 'Saw', 'machine')");
    await source.query(
      `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction, isFinalized, lifecyclePending,
        attributedOperatingDurationInMinutes, sessionDurationCreditsPerMinute, operatingDurationCreditsPerMinute) VALUES
        (1, 1, 1, '2026-03-01 08:00:00', NULL, 'usage', 1, 0, 2.25, 3, 0),
        (2, 2, 2, '2026-03-01 08:05:00', NULL, 'usage', 0, 1, NULL, NULL, NULL),
        (3, 1, 2, '2026-02-28 07:00:00', '2026-02-28 07:00:00', 'usage', 0, 0, 0, NULL, NULL)`,
    );
    await source.query(
      `INSERT INTO resource_usage_lifecycle_attempt (id, resourceId, kind, candidateUsageId, previousUsageId,
        transitionTime, formSubmissions, billingItems, createdAt) VALUES
        ('attempt-1', 2, 'start', 2, NULL, '2026-03-01 08:05:00', '[]', '[{"name":"Blade","unitPrice":4,"quantity":1}]',
        '2026-03-01 08:05:01')`,
    );
    await source.query(
      `INSERT INTO resource_usage_recovery (usageId, resourceId, userId, startTime, originalEndNotes,
        originalAttributedOperatingDurationInMinutes, recoveredAt, reason) VALUES
        (3, 1, 2, '2026-02-28 07:00:00', NULL, 1.5, '2026-02-28 07:10:00', 'cancelled_orphan_unfinalized_session')`,
    );
  },
  installPlugins: async (file, source) => [await installBookingsPlugin(file, source)],
};

const booking = table({
  id: f.id(),
  slot: f.timestamp(),
  confirmed: f.boolean(),
  note: f.text().optional(),
});
const BOOKINGS_STORAGE = definePluginStorage({
  tables: { booking },
  migrations: [{ version: 1, name: 'bookings', steps: [step.createTable('booking', booking)] }],
});

/** The 2.x plugin "bookings", installed in the SQLite file of this state: storage migrated, one booking written. */
export const BOOKINGS_PLUGIN = { id: 'bookings', version: '1.4.0' } as const;
export const BOOKINGS_TABLE = 'plugin_bookings_booking';

export async function installBookingsPlugin(file: string, source: DataSource): Promise<PluginDescriptor> {
  const storage = compilePluginStorage(BOOKINGS_PLUGIN.id, BOOKINGS_STORAGE, {
    reservedTables: postgresBackend.plugins.coreTableNames(),
  });
  await createSqlitePluginMigrationEngine(file).migrate(storage);
  await source.query(
    `INSERT INTO "${BOOKINGS_TABLE}" ("slot", "confirmed", "note") VALUES ('2026-03-02 09:00:00.000', 1, 'Router')`,
  );
  return { ...BOOKINGS_PLUGIN, storage };
}
