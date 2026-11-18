import type { DataSource } from 'typeorm';
import { appliedPluginMigrationsOn, usageSessionsOn, utc } from './older-state-ports.test-fixture';
import { rows, type OlderState } from './older-state.test-fixture';

const PLUGIN_TRACK = 'plugin_bookings_migrations';
const PLUGIN_MIGRATIONS = ['CreateBookings1700000000000', 'AddBookingNote1700000000001'];

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
    // What TypeORM's migration executor of the plugin lifecycle created in the same database file.
    await source.query(
      `CREATE TABLE "${PLUGIN_TRACK}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL,
        "name" varchar NOT NULL)`,
    );
    await source.query(`INSERT INTO "${PLUGIN_TRACK}" ("timestamp", "name") VALUES (?, ?), (?, ?)`, [
      1700000000000,
      PLUGIN_MIGRATIONS[0],
      1700000000001,
      PLUGIN_MIGRATIONS[1],
    ]);
    await source.query(
      `CREATE TABLE "plugin_bookings_booking" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        "slot" datetime NOT NULL, "confirmed" boolean NOT NULL, "note" text)`,
    );
    await source.query(
      `INSERT INTO "plugin_bookings_booking" ("slot", "confirmed", "note") VALUES ('2026-03-02 09:00:00', 1, 'Router')`,
    );
  },
  async verify(source) {
    expect(
      await rows(
        source,
        'SELECT id, resourceId, userId, startTime, endTime, isFinalized, lifecyclePending FROM resource_usage ORDER BY id',
      ),
    ).toEqual([
      {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: '2026-03-01 08:00:00',
        endTime: null,
        isFinalized: 1,
        lifecyclePending: 0,
      },
      {
        id: 2,
        resourceId: 2,
        userId: 2,
        startTime: '2026-03-01 08:05:00',
        endTime: null,
        isFinalized: 0,
        lifecyclePending: 1,
      },
      {
        id: 3,
        resourceId: 1,
        userId: 2,
        startTime: '2026-02-28 07:00:00',
        endTime: '2026-02-28 07:00:00',
        isFinalized: 0,
        lifecyclePending: 0,
      },
    ]);
    expect(
      await rows(
        source,
        'SELECT usageId, originalAttributedOperatingDurationInMinutes AS operating, recoveredAt, reason FROM resource_usage_recovery',
      ),
    ).toEqual([
      {
        usageId: 3,
        operating: 1.5,
        recoveredAt: '2026-02-28 07:10:00',
        reason: 'cancelled_orphan_unfinalized_session',
      },
    ]);
    expect(await rows(source, 'SELECT slot, confirmed, note FROM plugin_bookings_booking')).toEqual([
      { slot: '2026-03-02 09:00:00', confirmed: 1, note: 'Router' },
    ]);

    await verifyThroughPorts(source);
  },
};

async function verifyThroughPorts(source: DataSource): Promise<void> {
  const sessions = usageSessionsOn(source);
  // The running session is still the machine's active one, with typed values.
  const [running, ...others] = await sessions.findActiveSessions(1);
  expect(others).toEqual([]);
  expect(running).toMatchObject({ id: 1, userId: 1, endTime: null, isFinalized: true, lifecyclePending: false });
  expect(running.startTime).toEqual(utc('2026-03-01 08:00:00'));
  expect(running.attributedOperatingDurationInMinutes).toBe(2.25);
  expect(running.sessionDurationCreditsPerMinute).toBe(3);
  // A reservation is never published; its attempt still holds the start.
  expect(await sessions.findActiveSessions(2)).toEqual([]);
  const attempt = await sessions.findAttempt('attempt-1', 2);
  expect(attempt).toMatchObject({
    kind: 'start',
    candidateUsageId: 2,
    previousUsageId: null,
    formSubmissions: [],
    billingItems: [{ name: 'Blade', unitPrice: 4, quantity: 1 }],
  });
  expect(attempt?.transitionTime).toEqual(utc('2026-03-01 08:05:00'));
  expect(await sessions.isSessionBeingEnded(1)).toBe(false);
  // The plugin's legacy migration history is intact: the host adopts it as the baseline, it never re-runs or drops it.
  expect(await appliedPluginMigrationsOn(source, PLUGIN_TRACK)).toEqual([...PLUGIN_MIGRATIONS].reverse());
}
