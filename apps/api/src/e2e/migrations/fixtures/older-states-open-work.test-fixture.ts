import type { OlderState } from './older-state.test-fixture';

/** The plugin tables of this state. Plugin data is not moved to PostgreSQL. */
export const BOOKINGS_TABLE = 'plugin_bookings_booking';
export const BOOKINGS_HISTORY = 'plugin_migrations_bookings';

/**
 * A deployment stopped in the middle of work, before parallel machine sessions: a running session (no end time), a
 * start that was reserved but not yet published (with its lifecycle attempt), a session that restart recovery had
 * cancelled (with its recovery journal row), and an installed plugin with its own tables and data (not moved).
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
    // The tables a 1.x plugin kept in the same file: its data and its TypeORM migration history.
    await source.query(
      `CREATE TABLE "${BOOKINGS_TABLE}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "slot" datetime NOT NULL,
        "confirmed" boolean NOT NULL, "note" text)`,
    );
    await source.query(
      `INSERT INTO "${BOOKINGS_TABLE}" (slot, confirmed, note) VALUES ('2026-03-02 09:00:00', 1, 'Router')`,
    );
    await source.query(
      `CREATE TABLE "${BOOKINGS_HISTORY}" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "timestamp" bigint NOT NULL,
        "name" varchar NOT NULL)`,
    );
    await source.query(
      `INSERT INTO "${BOOKINGS_HISTORY}" (timestamp, name) VALUES (1700000000000, 'Bookings1700000000000')`,
    );
  },
};
