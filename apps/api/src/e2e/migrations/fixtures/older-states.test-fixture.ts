import { rows, type OlderState } from './older-state.test-fixture';
import { openWorkRelease } from './older-states-open-work.test-fixture';

export type { OlderState } from './older-state.test-fixture';

/** The first releases: boolean permission flags, no billing, usage without any price snapshot. */
const earlyRelease: OlderState = {
  name: 'first releases (boolean permissions, plain usage)',
  timestamp: 1741806539678,
  async seed(source) {
    await source.query(
      `INSERT INTO "user" (id, username, email, isEmailVerified, canManageResources, canManageUsers) VALUES
        (1, 'alice', 'Alice@Example.COM', 1, 1, 0), (2, 'bob', 'bob@example.com', 1, 0, 1)`,
    );
    await source.query(
      "INSERT INTO authentication_detail (userId, type, password) VALUES (1, 'local_password', 'bcrypt-hash-alice')",
    );
    await source.query("INSERT INTO resource (id, name, description) VALUES (1, 'Laser', 'CO2 laser, 60 W')");
    await source.query(
      `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, startNotes) VALUES
        (1, 1, 1, '2025-03-10 09:00:00', '2025-03-10 10:30:00', 'first job')`,
    );
  },
};

/** Billing exists and the database keeps balances current with triggers. */
const billingRelease: OlderState = {
  name: 'billing release (balances kept by triggers)',
  timestamp: 1759695000000,
  async seed(source) {
    await source.query(
      `INSERT INTO "user" (id, username, email, canManageBilling) VALUES
        (1, 'carol', 'carol@example.com', 1), (2, 'dave', 'dave@example.com', 0)`,
    );
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Printer', 'machine')");
    await source.query(
      'INSERT INTO resource_billing_configuration (resourceId, creditsPerUsage, creditsPerMinute) VALUES (1, 10, 2)',
    );
    await source.query(
      `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction) VALUES
        (1, 1, 1, '2025-10-01 10:00:00', '2025-10-01 10:45:00', 'usage')`,
    );
    // The insert trigger credits the balance of completed transactions only.
    await source.query(
      `INSERT INTO billing_transaction (id, userId, amount, status, resourceUsageId, externalReference) VALUES
        (1, 1, 1000, 'completed', NULL, 'topup-1'),
        (2, 1, -100, 'completed', 1, NULL),
        (3, 1, 500, 'pending', NULL, 'topup-2'),
        (4, 2, 250, 'completed', NULL, 'topup-3')`,
    );
    await source.query(
      `INSERT INTO billing_transaction_item (billingTransactionId, name, description, unitPrice, quantity) VALUES
        (2, 'Usage', 'Start of session', 10, 1), (2, 'Duration', '45 minutes', 2, 45)`,
    );
    expect(await rows(source, 'SELECT id, creditBalance FROM "user" ORDER BY id')).toEqual([
      { id: 1, creditBalance: 900 },
      { id: 2, creditBalance: 250 },
    ]);
  },
};

/** RBAC, durable audit and the first usage price snapshots. */
const auditAndSnapshotsRelease: OlderState = {
  name: 'RBAC and audit release (session and operating price snapshots)',
  timestamp: 1784300000000,
  async seed(source) {
    await source.query(
      `INSERT INTO "user" (id, username, email) VALUES
        (1, 'erin', 'erin@example.com'), (2, 'frank', 'frank@example.com')`,
    );
    const [{ id: roleId }] = await rows<{ id: number }>(source, "SELECT id FROM role WHERE key = 'resource-manager'");
    await source.query("INSERT INTO user_role (userId, roleId, source) VALUES (2, ?, 'manual')", [roleId]);
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'CNC', 'machine')");
    await source.query(
      `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction, isFinalized,
        attributedOperatingDurationInMinutes, sessionDurationCreditsPerMinute, operatingDurationCreditsPerMinute)
        VALUES (1, 1, 1, '2026-02-02 08:00:00', '2026-02-02 09:00:00', 'usage', 1, 12.5, 3, 7)`,
    );
    await source.query(
      `INSERT INTO billing_transaction (id, userId, amount, status, resourceUsageId) VALUES
        (1, 1, 500, 'completed', NULL), (2, 1, -202, 'completed', 1)`,
    );
    await source.query(
      `INSERT INTO billing_transaction_item (billingTransactionId, name, unitPrice, quantity) VALUES
        (2, 'Session', 3, 60), (2, 'Operating', 7, 3)`,
    );
    await source.query(
      `INSERT INTO audit_log (id, at, domain, action, operationId, actorId, outcome, subjectType, subjectId, ipAddress, details)
        VALUES (1, '2026-02-02 09:00:01', 'resource', 'resource.usage.end', 'op-1', 1, 'success', 'resource', 1, '10.0.0.7',
          '{"usageId":1,"credits":202}'),
        (2, '2026-02-03 12:00:00', 'identity', 'user.login', 'op-2', 2, 'failure', 'user', 2, NULL, '{}')`,
    );
  },
};

const LIFETIME = '123456789012345678901234567890.123456789';

/** Generic meters: readings and consumption are exact decimal strings, never floating point. */
const meterRelease: OlderState = {
  name: 'generic meter release (exact decimal readings)',
  timestamp: 1792000000000,
  async seed(source) {
    await source.query("INSERT INTO \"user\" (id, username, email) VALUES (1, 'gina', 'gina@example.com')");
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Oven', 'machine')");
    await source.query(
      `INSERT INTO resource_meter (id, resourceId, name, creditsPerUnit, lifetimeValue, counterValue, latestObservedAt)
        VALUES (1, 1, 'Energy (kWh)', 15, ?, '1000.000000001', '2026-06-01 12:00:00')`,
      [LIFETIME],
    );
    await source.query(
      `INSERT INTO resource_usage (id, resourceId, userId, startTime, endTime, usageAction, isFinalized, billingFactor,
        creditsPerUsage, meterRates) VALUES (1, 1, 1, '2026-06-01 10:00:00', '2026-06-01 12:00:00', 'usage', 1, 100, 5,
        '[{"meterId":1,"creditsPerUnit":15}]')`,
    );
    await source.query(
      `INSERT INTO resource_metering_session (id, resourceId, usageId, status, creditsPerUnit, baselineValue, source,
        latestValue, latestObservedAt, consumedValue, chargeCredits, settledAt, meterId, collectionMode, meterName)
        VALUES ('session-1', 1, 1, 'settled', 15, '1000.000000001', 'grid', '1012.345678902', '2026-06-01 12:00:00',
        '12.345678901', 186, '2026-06-01 12:00:01', 1, 'requested', 'Energy (kWh)')`,
    );
    await source.query(
      "INSERT INTO billing_transaction (id, userId, amount, status, resourceUsageId) VALUES (1, 1, -191, 'completed', 1)",
    );
    await source.query(
      `INSERT INTO billing_transaction_item (billingTransactionId, name, unitPrice, quantity, durationMs, meterQuantity,
        meterCreditsPerUnit) VALUES (1, 'Energy (kWh)', 186, 1, 7200000, '12.345678901', 15)`,
    );
  },
};

export const olderStates: readonly OlderState[] = [
  earlyRelease,
  billingRelease,
  auditAndSnapshotsRelease,
  openWorkRelease,
  meterRelease,
];
