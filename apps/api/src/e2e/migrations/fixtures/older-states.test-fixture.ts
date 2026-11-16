import type { DataSource } from 'typeorm';

/**
 * Representative older released states of a deployment. Each one is built by migrating a fresh database only up to
 * `timestamp` (so the schema is exactly what that release created), writing data with plain SQL in the columns that
 * release knew, and, after the remaining migrations ran, checking that this data survived with identical values.
 * Nothing here edits a released migration.
 */
export interface OlderState {
  readonly name: string;
  /** Class timestamp of the last migration this release had applied. */
  readonly timestamp: number;
  seed(source: DataSource): Promise<void>;
  /** Runs against the fully migrated database. */
  verify(source: DataSource): Promise<void>;
}

const rows = <T = Record<string, unknown>>(source: DataSource, sql: string, params: unknown[] = []): Promise<T[]> =>
  source.query(sql, params);

async function roleKeysOf(source: DataSource, userId: number): Promise<string[]> {
  const found = await rows<{ key: string }>(
    source,
    'SELECT r.key FROM user_role ur JOIN role r ON r.id = ur.roleId WHERE ur.userId = ? ORDER BY r.key',
    [userId],
  );
  return found.map((row) => row.key);
}

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
  async verify(source) {
    const users = await rows(source, 'SELECT id, username, email, isEmailVerified FROM "user" ORDER BY id');
    // Released migration 1792900000000 lower-cases e-mail addresses; everything else is untouched.
    expect(users).toEqual([
      { id: 1, username: 'alice', email: 'alice@example.com', isEmailVerified: 1 },
      { id: 2, username: 'bob', email: 'bob@example.com', isEmailVerified: 1 },
    ]);
    expect(await rows(source, 'SELECT userId, type FROM authentication_detail')).toEqual([
      { userId: 1, type: 'local_password' },
    ]);
    expect(await rows(source, 'SELECT id, name, description FROM resource')).toEqual([
      { id: 1, name: 'Laser', description: 'CO2 laser, 60 W' },
    ]);
    expect(
      await rows(
        source,
        'SELECT id, resourceId, userId, startTime, endTime, startNotes, usageInMinutes FROM resource_usage',
      ),
    ).toEqual([
      {
        id: 1,
        resourceId: 1,
        userId: 1,
        startTime: '2025-03-10 09:00:00',
        endTime: '2025-03-10 10:30:00',
        startNotes: 'first job',
        usageInMinutes: 90,
      },
    ]);
    // The boolean permission columns became role assignments.
    expect(await roleKeysOf(source, 1)).toContain('resource-manager');
    expect(await roleKeysOf(source, 2)).toContain('user-manager');
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
  async verify(source) {
    expect(await rows(source, 'SELECT id, creditBalance FROM "user" ORDER BY id')).toEqual([
      { id: 1, creditBalance: 900 },
      { id: 2, creditBalance: 250 },
    ]);
    expect(
      await rows(
        source,
        'SELECT id, userId, amount, status, resourceUsageId, externalReference FROM billing_transaction ORDER BY id',
      ),
    ).toEqual([
      { id: 1, userId: 1, amount: 1000, status: 'completed', resourceUsageId: null, externalReference: 'topup-1' },
      { id: 2, userId: 1, amount: -100, status: 'completed', resourceUsageId: 1, externalReference: null },
      { id: 3, userId: 1, amount: 500, status: 'pending', resourceUsageId: null, externalReference: 'topup-2' },
      { id: 4, userId: 2, amount: 250, status: 'completed', resourceUsageId: null, externalReference: 'topup-3' },
    ]);
    expect(
      await rows(
        source,
        'SELECT billingTransactionId, name, description, unitPrice, quantity FROM billing_transaction_item ORDER BY id',
      ),
    ).toEqual([
      { billingTransactionId: 2, name: 'Usage', description: 'Start of session', unitPrice: 10, quantity: 1 },
      { billingTransactionId: 2, name: 'Duration', description: '45 minutes', unitPrice: 2, quantity: 45 },
    ]);
    expect(await rows(source, 'SELECT usageInMinutes FROM resource_usage WHERE id = 1')).toEqual([
      { usageInMinutes: 45 },
    ]);
    expect(await roleKeysOf(source, 1)).toContain('billing-manager');
    expect(await roleKeysOf(source, 2)).not.toContain('billing-manager');
    // The balance stays derived from the completed transactions after the upgrade, and the trigger still maintains it.
    const [{ total }] = await rows<{ total: number }>(
      source,
      "SELECT SUM(amount) AS total FROM billing_transaction WHERE userId = 1 AND status = 'completed'",
    );
    expect(total).toBe(900);
    await source.query("INSERT INTO billing_transaction (userId, amount, status) VALUES (2, -50, 'completed')");
    expect(await rows(source, 'SELECT creditBalance FROM "user" WHERE id = 2')).toEqual([{ creditBalance: 200 }]);
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
  async verify(source) {
    expect(await roleKeysOf(source, 2)).toEqual(['resource-manager']);
    expect(await rows(source, 'SELECT id, creditBalance FROM "user" ORDER BY id')).toEqual([
      { id: 1, creditBalance: 298 },
      { id: 2, creditBalance: 0 },
    ]);
    // Price snapshots are evidence of what was charged: never recomputed from the current price.
    expect(
      await rows(
        source,
        `SELECT isFinalized, attributedOperatingDurationInMinutes AS operating, sessionDurationCreditsPerMinute AS session,
          operatingDurationCreditsPerMinute AS op, ROUND(usageInMinutes) AS usageInMinutes FROM resource_usage WHERE id = 1`,
      ),
    ).toEqual([{ isFinalized: 1, operating: 12.5, session: 3, op: 7, usageInMinutes: 60 }]);
    expect(
      await rows(
        source,
        'SELECT billingTransactionId, name, unitPrice, quantity FROM billing_transaction_item ORDER BY id',
      ),
    ).toEqual([
      { billingTransactionId: 2, name: 'Session', unitPrice: 3, quantity: 60 },
      { billingTransactionId: 2, name: 'Operating', unitPrice: 7, quantity: 3 },
    ]);
    expect(
      await rows(
        source,
        'SELECT id, at, domain, action, operationId, actorId, outcome, subjectType, subjectId, ipAddress, details FROM audit_log ORDER BY id',
      ),
    ).toEqual([
      {
        id: 1,
        at: '2026-02-02 09:00:01',
        domain: 'resource',
        action: 'resource.usage.end',
        operationId: 'op-1',
        actorId: 1,
        outcome: 'success',
        subjectType: 'resource',
        subjectId: 1,
        ipAddress: '10.0.0.7',
        details: '{"usageId":1,"credits":202}',
      },
      {
        id: 2,
        at: '2026-02-03 12:00:00',
        domain: 'identity',
        action: 'user.login',
        operationId: 'op-2',
        actorId: 2,
        outcome: 'failure',
        subjectType: 'user',
        subjectId: 2,
        ipAddress: null,
        details: '{}',
      },
    ]);
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
  async verify(source) {
    expect(
      await rows(
        source,
        'SELECT id, resourceId, name, creditsPerUnit, lifetimeValue, counterValue, latestObservedAt FROM resource_meter',
      ),
    ).toEqual([
      {
        id: 1,
        resourceId: 1,
        name: 'Energy (kWh)',
        creditsPerUnit: 15,
        lifetimeValue: LIFETIME,
        counterValue: '1000.000000001',
        latestObservedAt: '2026-06-01 12:00:00',
      },
    ]);
    expect(
      await rows(
        source,
        `SELECT id, usageId, status, creditsPerUnit, baselineValue, latestValue, consumedValue, chargeCredits, meterId
          FROM resource_metering_session`,
      ),
    ).toEqual([
      {
        id: 'session-1',
        usageId: 1,
        status: 'settled',
        creditsPerUnit: 15,
        baselineValue: '1000.000000001',
        latestValue: '1012.345678902',
        consumedValue: '12.345678901',
        chargeCredits: 186,
        meterId: 1,
      },
    ]);
    expect(
      await rows(
        source,
        'SELECT billingFactor, creditsPerUsage, meterRates, ROUND(usageInMinutes) AS usageInMinutes FROM resource_usage',
      ),
    ).toEqual([
      {
        billingFactor: 100,
        creditsPerUsage: 5,
        meterRates: '[{"meterId":1,"creditsPerUnit":15}]',
        usageInMinutes: 120,
      },
    ]);
    expect(
      await rows(
        source,
        'SELECT unitPrice, quantity, durationMs, meterQuantity, meterCreditsPerUnit FROM billing_transaction_item',
      ),
    ).toEqual([
      { unitPrice: 186, quantity: 1, durationMs: 7200000, meterQuantity: '12.345678901', meterCreditsPerUnit: 15 },
    ]);
    expect(await rows(source, 'SELECT creditBalance FROM "user" WHERE id = 1')).toEqual([{ creditBalance: -191 }]);
  },
};

export const olderStates: readonly OlderState[] = [
  earlyRelease,
  billingRelease,
  auditAndSnapshotsRelease,
  meterRelease,
];
