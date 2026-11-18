import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../test-utils/test-database';
import { postgresErrorClassifier } from './postgres-errors';

describe('PostgreSQL baseline migration', () => {
  let source: DataSource;
  beforeAll(async () => {
    source = await createTestDataSource();
  }, 120_000);
  afterAll(() => closeTestDataSource(source));

  const one = async <T>(sql: string, params: unknown[] = []) => (await source.query(sql, params))[0] as T;
  const user = (id: number) =>
    source.query(`INSERT INTO "user" (id, username, email) VALUES ($1, $2, $3)`, [id, `u${id}`, `u${id}@example.com`]);

  it('records the baseline and seeds the defaults', async () => {
    const migrations = await source.query('SELECT name FROM migrations');
    expect(migrations.map((m: { name: string }) => m.name)).toEqual(['PostgresBaseline1800000000000']);
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
    await user(1);
    await source.query(`INSERT INTO resource (id, name, type) VALUES (1, 'Laser', 'machine')`);
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
    await user(2);
    await source.query(
      `INSERT INTO billing_transaction ("userId", amount, status) VALUES (2, 1000, 'completed'), (2, 500, 'pending')`,
    );
    expect((await one<{ b: number }>('SELECT "creditBalance" AS b FROM "user" WHERE id = 2')).b).toBe(1000);
    await source.query(`UPDATE billing_transaction SET status = 'completed' WHERE amount = 500`);
    expect((await one<{ b: number }>('SELECT "creditBalance" AS b FROM "user" WHERE id = 2')).b).toBe(1500);
    await source.query(`DELETE FROM billing_transaction WHERE amount = 1000`);
    expect((await one<{ b: number }>('SELECT "creditBalance" AS b FROM "user" WHERE id = 2')).b).toBe(500);
  });

  it('holds credits beyond 2^53 exactly', async () => {
    await user(3);
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
         VALUES ($1, 1, 2, now(), 'usage', $2, $3)`,
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
