import type { DataSource } from 'typeorm';
import { versionsTableName } from '../../../plugin-system/plugin-storage/storage-model';
import { BOOKINGS_PLUGIN, BOOKINGS_TABLE } from './older-states-open-work.test-fixture';

const q = <T = Record<string, unknown>>(source: DataSource, sql: string, params: unknown[] = []): Promise<T[]> =>
  source.query(sql, params);

/** Trailing zeros of a decimal carry no value (the PostgreSQL column keeps its scale). */
const decimal = (value: unknown): string =>
  String(value)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');

const roleKeysOf = async (source: DataSource, userId: number): Promise<string[]> =>
  (
    await q<{ key: string }>(
      source,
      'SELECT r.key FROM user_role ur JOIN role r ON r.id = ur."roleId" WHERE ur."userId" = $1 ORDER BY r.key',
      [userId],
    )
  ).map((row) => row.key);

const nextUserId = async (source: DataSource): Promise<number> =>
  (
    await q<{ id: number }>(
      source,
      `INSERT INTO "user" (username, email) VALUES ('after-the-transfer', 'after@example.com') RETURNING id`,
    )
  )[0].id;

/**
 * What each older release's data must look like in PostgreSQL after the transfer, by the name of the state: written
 * for PostgreSQL (typed values, quoted camelCase columns), independent of how SQLite stored the same data.
 */
export const postgresExpectations: Record<string, (pg: DataSource) => Promise<void>> = {
  'first releases (boolean permissions, plain usage)': async (pg) => {
    expect(await q(pg, 'SELECT id, username, email, "isEmailVerified" FROM "user" ORDER BY id')).toEqual([
      { id: 1, username: 'alice', email: 'alice@example.com', isEmailVerified: true },
      { id: 2, username: 'bob', email: 'bob@example.com', isEmailVerified: true },
    ]);
    expect(await q(pg, 'SELECT "userId", type FROM authentication_detail')).toEqual([
      { userId: 1, type: 'local_password' },
    ]);
    // The boolean permission columns became role assignments before the data moved.
    expect(await roleKeysOf(pg, 1)).toContain('resource-manager');
    expect(await roleKeysOf(pg, 2)).toContain('user-manager');
    const [usage] = await q<{ startTime: Date; endTime: Date; startNotes: string; minutes: number }>(
      pg,
      'SELECT "startTime", "endTime", "startNotes", "usageInMinutes" AS minutes FROM resource_usage WHERE id = 1',
    );
    expect(usage.startTime).toEqual(new Date('2025-03-10T09:00:00.000Z'));
    expect(usage.endTime).toEqual(new Date('2025-03-10T10:30:00.000Z'));
    expect(usage.startNotes).toBe('first job');
    expect(Number(usage.minutes)).toBe(90);
    expect(await nextUserId(pg)).toBe(3);
  },

  'billing release (balances kept by triggers)': async (pg) => {
    // Balances were taken from the source: the trigger did not credit the copied transactions a second time.
    expect(await q(pg, 'SELECT id, "creditBalance" FROM "user" ORDER BY id')).toEqual([
      { id: 1, creditBalance: 900 },
      { id: 2, creditBalance: 250 },
    ]);
    expect(
      await q(
        pg,
        'SELECT id, "userId", amount, status, "resourceUsageId", "externalReference" FROM billing_transaction ORDER BY id',
      ),
    ).toEqual([
      { id: 1, userId: 1, amount: 1000, status: 'completed', resourceUsageId: null, externalReference: 'topup-1' },
      { id: 2, userId: 1, amount: -100, status: 'completed', resourceUsageId: 1, externalReference: null },
      { id: 3, userId: 1, amount: 500, status: 'pending', resourceUsageId: null, externalReference: 'topup-2' },
      { id: 4, userId: 2, amount: 250, status: 'completed', resourceUsageId: null, externalReference: 'topup-3' },
    ]);
    expect(
      await q(
        pg,
        'SELECT "billingTransactionId", name, "unitPrice", quantity FROM billing_transaction_item ORDER BY id',
      ),
    ).toEqual([
      { billingTransactionId: 2, name: 'Usage', unitPrice: 10, quantity: 1 },
      { billingTransactionId: 2, name: 'Duration', unitPrice: 2, quantity: 45 },
    ]);
    expect(
      Number((await q<{ m: number }>(pg, 'SELECT "usageInMinutes" AS m FROM resource_usage WHERE id = 1'))[0].m),
    ).toBe(45);
    expect(await roleKeysOf(pg, 1)).toContain('billing-manager');
    expect(await roleKeysOf(pg, 2)).not.toContain('billing-manager');
    // The balance maintenance is active in the target, and the next generated id follows the source's.
    const [{ id }] = await q<{ id: number }>(
      pg,
      `INSERT INTO billing_transaction ("userId", amount, status) VALUES (2, -50, 'completed') RETURNING id`,
    );
    expect(id).toBe(5);
    expect(await q(pg, 'SELECT "creditBalance" FROM "user" WHERE id = 2')).toEqual([{ creditBalance: 200 }]);
  },

  'RBAC and audit release (session and operating price snapshots)': async (pg) => {
    expect(await roleKeysOf(pg, 2)).toEqual(['resource-manager']);
    expect(await q(pg, 'SELECT id, "creditBalance" FROM "user" ORDER BY id')).toEqual([
      { id: 1, creditBalance: 298 },
      { id: 2, creditBalance: 0 },
    ]);
    // Price snapshots are evidence of what was charged: never recomputed from the current price.
    const [usage] = await q<Record<string, unknown>>(
      pg,
      `SELECT "isFinalized", "attributedOperatingDurationInMinutes" AS operating,
         "sessionDurationCreditsPerMinute" AS session, "operatingDurationCreditsPerMinute" AS op,
         ROUND("usageInMinutes")::int AS minutes FROM resource_usage WHERE id = 1`,
    );
    expect({ ...usage, operating: Number(usage.operating) }).toEqual({
      isFinalized: true,
      operating: 12.5,
      session: 3,
      op: 7,
      minutes: 60,
    });
    const audit = await q<{
      id: number;
      at: Date;
      actorId: number;
      outcome: string;
      ipAddress: string | null;
      details: unknown;
    }>(pg, 'SELECT id, at, "actorId", outcome, "ipAddress", details FROM audit_log ORDER BY id');
    expect(audit.map(({ id, at, actorId, outcome, ipAddress }) => ({ id, at, actorId, outcome, ipAddress }))).toEqual([
      { id: 1, at: new Date('2026-02-02T09:00:01.000Z'), actorId: 1, outcome: 'success', ipAddress: '10.0.0.7' },
      { id: 2, at: new Date('2026-02-03T12:00:00.000Z'), actorId: 2, outcome: 'failure', ipAddress: null },
    ]);
    const asJson = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value);
    expect(audit.map((row) => asJson(row.details))).toEqual([{ usageId: 1, credits: 202 }, {}]);
    // The audit trail stays immutable in the target.
    await expect(pg.query(`UPDATE audit_log SET action = 'changed' WHERE id = 1`)).rejects.toThrow(/immutable/);
  },

  'release with open work (running session, pending start, recovery journal, plugin tables)': async (pg) => {
    const [running] = await q<{ endTime: Date | null; isFinalized: boolean; startTime: Date; operating: unknown }>(
      pg,
      `SELECT "endTime", "isFinalized", "startTime", "attributedOperatingDurationInMinutes" AS operating
         FROM resource_usage WHERE id = 1`,
    );
    expect(running.endTime).toBeNull();
    expect(running.isFinalized).toBe(true);
    expect(running.startTime).toEqual(new Date('2026-03-01T08:00:00.000Z'));
    expect(Number(running.operating)).toBe(2.25);
    // The reservation is not published; its attempt still holds the start.
    expect(await q(pg, 'SELECT id, "isFinalized", "lifecyclePending" FROM resource_usage WHERE id = 2')).toEqual([
      { id: 2, isFinalized: false, lifecyclePending: true },
    ]);
    const [attempt] = await q<Record<string, unknown>>(
      pg,
      `SELECT kind, "candidateUsageId", "previousUsageId", "transitionTime", "formSubmissions", "billingItems"
         FROM resource_usage_lifecycle_attempt WHERE id = 'attempt-1'`,
    );
    const asJson = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value);
    expect(attempt).toMatchObject({ kind: 'start', candidateUsageId: 2, previousUsageId: null });
    expect(attempt.transitionTime).toEqual(new Date('2026-03-01T08:05:00.000Z'));
    expect(asJson(attempt.formSubmissions)).toEqual([]);
    expect(asJson(attempt.billingItems)).toEqual([{ name: 'Blade', unitPrice: 4, quantity: 1 }]);
    // The recovery journal row is kept.
    expect(await q(pg, 'SELECT "usageId", reason FROM resource_usage_recovery')).toEqual([
      { usageId: 3, reason: 'cancelled_orphan_unfinalized_session' },
    ]);
    // The plugin: its table with the row, and the storage version recorded in its own bookkeeping.
    const [booking] = await q<{ slot: Date; confirmed: boolean; note: string }>(
      pg,
      `SELECT slot, confirmed, note FROM "${BOOKINGS_TABLE}"`,
    );
    expect(booking).toEqual({ slot: new Date('2026-03-02T09:00:00.000Z'), confirmed: true, note: 'Router' });
    const versions = await q<{ version: number }>(
      pg,
      `SELECT version FROM "${versionsTableName(BOOKINGS_PLUGIN.id)}" ORDER BY version`,
    );
    expect(versions.map((row) => Number(row.version))).toEqual([1]);
  },

  'generic meter release (exact decimal readings)': async (pg) => {
    const LIFETIME = '123456789012345678901234567890.123456789';
    const [meter] = await q<Record<string, unknown>>(
      pg,
      `SELECT "creditsPerUnit", "lifetimeValue"::text AS lifetime, "counterValue"::text AS counter, "latestObservedAt" FROM resource_meter`,
    );
    expect(decimal(meter.lifetime)).toBe(LIFETIME);
    expect(decimal(meter.counter)).toBe('1000.000000001');
    expect(meter.latestObservedAt).toEqual(new Date('2026-06-01T12:00:00.000Z'));
    const [session] = await q<Record<string, unknown>>(
      pg,
      `SELECT id, status, "baselineValue"::text AS baseline, "latestValue"::text AS latest,
         "consumedValue"::text AS consumed, "chargeCredits" FROM resource_metering_session`,
    );
    expect({
      id: session.id,
      status: session.status,
      baseline: decimal(session.baseline),
      latest: decimal(session.latest),
      consumed: decimal(session.consumed),
      chargeCredits: Number(session.chargeCredits),
    }).toEqual({
      id: 'session-1',
      status: 'settled',
      baseline: '1000.000000001',
      latest: '1012.345678902',
      consumed: '12.345678901',
      chargeCredits: 186,
    });
    const [usage] = await q<Record<string, unknown>>(
      pg,
      `SELECT "billingFactor", "creditsPerUsage", "meterRates", ROUND("usageInMinutes")::int AS minutes FROM resource_usage`,
    );
    const rates = typeof usage.meterRates === 'string' ? JSON.parse(usage.meterRates) : usage.meterRates;
    expect({ ...usage, meterRates: rates, billingFactor: Number(usage.billingFactor) }).toEqual({
      billingFactor: 100,
      creditsPerUsage: 5,
      meterRates: [{ meterId: 1, creditsPerUnit: 15 }],
      minutes: 120,
    });
    const [item] = await q<Record<string, unknown>>(
      pg,
      `SELECT "unitPrice", quantity, "durationMs", "meterQuantity"::text AS qty, "meterCreditsPerUnit" FROM billing_transaction_item`,
    );
    expect({ ...item, qty: decimal(item.qty) }).toEqual({
      unitPrice: 186,
      quantity: 1,
      durationMs: 7200000,
      qty: '12.345678901',
      meterCreditsPerUnit: 15,
    });
    expect(await q(pg, 'SELECT "creditBalance" FROM "user" WHERE id = 1')).toEqual([{ creditBalance: -191 }]);
  },
};
