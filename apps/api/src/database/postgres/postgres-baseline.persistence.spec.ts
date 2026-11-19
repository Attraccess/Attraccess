import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { postgresErrorClassifier } from './postgres-errors';

describe('PostgreSQL baseline migration', () => {
  let source: DataSource;
  const one = async <T>(sql: string, params: unknown[] = []) => (await source.query(sql, params))[0] as T;
  const user = (id: number) =>
    source.query(`INSERT INTO "user" (id, username, email) VALUES ($1, $2, $3)`, [id, `u${id}`, `u${id}@example.com`]);

  // Every test uses rows of its own, seeded here, so the tests pass in any order and alone.
  beforeAll(async () => {
    source = await createTestDataSource();
    for (const id of [1, 2, 3, 4, 5, 6]) await user(id);
    await source.query(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`);
  }, 120_000);
  afterAll(() => closeTestDataSource(source));

  const balance = async (userId: number) =>
    (await one<{ b: number }>('SELECT "creditBalance" AS b FROM "user" WHERE id = $1', [userId])).b;
  const transaction = async (userId: number, amount: number, status: 'pending' | 'completed' | 'failed') =>
    (
      await one<{ id: number }>(
        `INSERT INTO billing_transaction ("userId", amount, status) VALUES ($1, $2, $3) RETURNING id`,
        [userId, amount, status],
      )
    ).id;
  /** The invariant the triggers keep: a balance is the sum of the user's completed transactions. */
  const expectBalancesMatchCompleted = async (userIds: number[]) => {
    for (const userId of userIds) {
      const completed = await one<{ sum: number }>(
        `SELECT COALESCE(SUM(amount), 0)::int AS sum FROM billing_transaction WHERE "userId" = $1 AND status = 'completed'`,
        [userId],
      );
      expect(await balance(userId)).toBe(completed.sum);
    }
  };

  it('records the baseline and seeds the defaults', async () => {
    const migrations = await source.query('SELECT name FROM migrations');
    expect(migrations.map((m: { name: string }) => m.name)).toEqual(['PostgresBaseline1760000000000']);
    const [{ count }] = await source.query('SELECT COUNT(*)::int AS count FROM role');
    expect(count).toBeGreaterThanOrEqual(6);
    const [setting] = await source.query(
      `SELECT value FROM setting WHERE parent = 'auth' AND key = 'rate_limit_max_attempts'`,
    );
    expect(setting.value).toBe('5');
  });

  it('continues generated keys after the seeded rows', async () => {
    const created = await one<{ id: number }>(
      `INSERT INTO setting (parent, key, value) VALUES ('x', 'y', 'z') RETURNING id`,
    );
    expect(created.id).toBeGreaterThan(17);
  });

  it('computes usageInMinutes: -1 while open, minutes once closed', async () => {
    await source.query(
      `INSERT INTO resource_usage (id, "resourceId", "userId", "startTime", "usageAction", "isFinalized")
       VALUES (1, 1, 1, '2026-03-29T01:00:00Z', 'usage', true)`,
    );
    expect((await one<{ m: number }>('SELECT "usageInMinutes" AS m FROM resource_usage WHERE id = 1')).m).toBe(-1);
    await source.query(`UPDATE resource_usage SET "endTime" = '2026-03-29T02:30:30Z' WHERE id = 1`);
    expect((await one<{ m: number }>('SELECT "usageInMinutes" AS m FROM resource_usage WHERE id = 1')).m).toBeCloseTo(
      90.5,
    );
  });

  it('keeps a user balance equal to completed billing transactions', async () => {
    await source.query(
      `INSERT INTO billing_transaction ("userId", amount, status) VALUES (2, 1000, 'completed'), (2, 500, 'pending')`,
    );
    expect(await balance(2)).toBe(1000);
    await source.query(`UPDATE billing_transaction SET status = 'completed' WHERE "userId" = 2 AND amount = 500`);
    expect(await balance(2)).toBe(1500);
    await source.query(`DELETE FROM billing_transaction WHERE "userId" = 2 AND amount = 1000`);
    expect(await balance(2)).toBe(500);
    await expectBalancesMatchCompleted([2]);
  });

  it('follows amount changes, user moves and status changes of billing transactions', async () => {
    const completed = await transaction(4, 100, 'completed');
    const pending = await transaction(4, 50, 'pending');
    await transaction(4, 70, 'failed');
    expect([await balance(4), await balance(5)]).toEqual([100, 0]);

    // pending -> completed together with an amount change adds the new amount only.
    await source.query(`UPDATE billing_transaction SET status = 'completed', amount = 60 WHERE id = $1`, [pending]);
    expect(await balance(4)).toBe(160);
    await expectBalancesMatchCompleted([4, 5]);

    // The amount of a completed transaction changes: the old amount comes off, the new one goes on.
    await source.query(`UPDATE billing_transaction SET amount = 40 WHERE id = $1`, [completed]);
    expect(await balance(4)).toBe(100);
    await expectBalancesMatchCompleted([4, 5]);

    // A completed transaction moves to another user: off the old user's balance, onto the new one's.
    await source.query(`UPDATE billing_transaction SET "userId" = 5 WHERE id = $1`, [completed]);
    expect([await balance(4), await balance(5)]).toEqual([60, 40]);
    await expectBalancesMatchCompleted([4, 5]);

    // Moving and changing the amount at once.
    await source.query(`UPDATE billing_transaction SET "userId" = 4, amount = 45 WHERE id = $1`, [completed]);
    expect([await balance(4), await balance(5)]).toEqual([105, 0]);

    // completed -> failed takes it off again; a failed or pending row never counts.
    await source.query(`UPDATE billing_transaction SET status = 'failed' WHERE id = $1`, [pending]);
    expect(await balance(4)).toBe(45);
    await expectBalancesMatchCompleted([4, 5]);

    await source.query(`DELETE FROM billing_transaction WHERE "userId" = 4`);
    expect([await balance(4), await balance(5)]).toEqual([0, 0]);
    await expectBalancesMatchCompleted([4, 5]);
  });

  it('holds credits beyond 2^53 exactly', async () => {
    await source.query(
      `INSERT INTO billing_transaction ("userId", amount, status) VALUES (3, 9007199254740993, 'completed')`,
    );
    const row = await one<{ b: string }>('SELECT "creditBalance"::text AS b FROM "user" WHERE id = 3');
    expect(row.b).toBe('9007199254740993');
  });

  it('refuses a second published session of the same user on a resource and an unfinalized open one', async () => {
    const insert = (id: number, finalized: boolean, pending: boolean) =>
      source.query(
        `INSERT INTO resource_usage (id, "resourceId", "userId", "startTime", "usageAction", "isFinalized", "lifecyclePending")
         VALUES ($1, 1, 6, now(), 'usage', $2, $3)`,
        [id, finalized, pending],
      );
    await insert(10, true, false);
    await expect(insert(11, true, false)).rejects.toThrow(/already has an active usage session/);
    await expect(insert(12, false, false)).rejects.toThrow(/must be finalized or lifecycle-pending/);
    await insert(13, false, true);
  });

  it('keeps audit rows immutable', async () => {
    await source.query(
      `INSERT INTO audit_log (id, at, domain, action, "operationId", "actorId", outcome, "subjectType", "subjectId", details)
       VALUES (1, now(), 'resource', 'x', 'op', 1, 'success', 'resource', 1, '{}')`,
    );
    await expect(source.query(`UPDATE audit_log SET action = 'y' WHERE id = 1`)).rejects.toThrow(/immutable/);
  });

  it('classifies SQLSTATEs', async () => {
    const failure = async (work: Promise<unknown>) =>
      work.then(
        () => undefined,
        (error: unknown) => error,
      );
    expect(postgresErrorClassifier.classify(await failure(user(1)))).toBe('unique-violation');
    expect(
      postgresErrorClassifier.classify(
        await failure(
          source.query(
            `INSERT INTO resource_usage (id, "resourceId", "userId", "startTime", "usageAction", "isFinalized") VALUES (500, 999, 1, now(), 'usage', true)`,
          ),
        ),
      ),
    ).toBe('foreign-key-violation');
    // Values the column type cannot hold (an id past the integer range, malformed text, a NUL byte, a bad date).
    for (const [sql, param, code] of [
      ['SELECT id FROM "user" WHERE id = $1', '9999999999', '22003'],
      ['SELECT id FROM "user" WHERE id = $1', 'abc', '22P02'],
      ['SELECT id FROM "user" WHERE username = $1', 'nul\u0000byte', '22021'],
      ['SELECT id FROM "user" WHERE "createdAt" = $1', 'not a date', '22007'],
      ['SELECT id FROM "user" WHERE "createdAt" = $1', '2026-13-45T00:00:00Z', '22008'],
    ]) {
      const error = await failure(source.query(sql, [param]));
      expect([postgresErrorClassifier.diagnosticCode(error), postgresErrorClassifier.classify(error)]).toEqual([
        code,
        'invalid-input',
      ]);
    }
  });

  describe('on an empty database with the application entities loaded (the migration CLI)', () => {
    let empty: DataSource;
    beforeAll(async () => {
      empty = await createTestDataSource({ empty: true });
    }, 60_000);
    afterAll(() => closeTestDataSource(empty));

    it('applies the baseline although TypeORM prepared its metadata table first, and leaves no schema drift', async () => {
      await empty.runMigrations();
      expect((await empty.query('SELECT name FROM migrations')).length).toBe(1);
      const drift = await empty.driver.createSchemaBuilder().log();
      expect(drift.upQueries.map((q) => q.query)).toEqual([]);
    }, 120_000);
  });
});
