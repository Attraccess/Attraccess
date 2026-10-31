import { DataSource, QueryRunner } from 'typeorm';
import { ParallelMachineSessions1791900000000 } from './1791900000000-parallel-machine-sessions';

async function legacySchema(runner: QueryRunner) {
  await runner.query('CREATE TABLE resource (id integer PRIMARY KEY, name text)');
  await runner.query(`CREATE TABLE resource_usage (
    id integer PRIMARY KEY AUTOINCREMENT, resourceId integer NOT NULL, userId integer,
    usageAction text NOT NULL DEFAULT 'usage', isFinalized boolean NOT NULL DEFAULT 0,
    lifecyclePending boolean NOT NULL DEFAULT 0, endTime datetime)`);
  await runner.query(`CREATE TABLE resource_usage_lifecycle_attempt (
    id varchar PRIMARY KEY, resourceId integer NOT NULL, candidateUsageId integer, previousUsageId integer)`);
  await runner.query(
    'CREATE UNIQUE INDEX "IDX_resource_usage_lifecycle_attempt_resource" ON "resource_usage_lifecycle_attempt" ("resourceId")',
  );
  for (const operation of ['insert', 'update']) {
    // The shape of the legacy single-session guard; the migration only needs the names to drop.
    await runner.query(`CREATE TRIGGER resource_usage_single_active_${operation}
      AFTER ${operation.toUpperCase()} ON resource_usage
      WHEN NEW.endTime IS NULL AND NEW.usageAction = 'usage' AND NEW.isFinalized = 1 AND NEW.lifecyclePending = 0
      AND EXISTS (SELECT 1 FROM resource_usage o WHERE o.resourceId = NEW.resourceId AND o.id != NEW.id AND o.endTime IS NULL AND o.usageAction = 'usage' AND o.isFinalized = 1 AND o.lifecyclePending = 0)
      BEGIN SELECT RAISE(ABORT, 'Resource already has an active usage session'); END`);
  }
  await runner.query(
    'CREATE UNIQUE INDEX IDX_resource_usage_pending_resource ON resource_usage (resourceId) WHERE lifecyclePending = 1 AND endTime IS NULL',
  );
}

describe('parallel machine sessions migration', () => {
  it('defaults existing machines to 1 and swaps single-session guards for per-person ones', async () => {
    const source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    const runner = source.createQueryRunner();
    try {
      await legacySchema(runner);
      await runner.query("INSERT INTO resource VALUES (1, 'lathe')");
      await runner.query('INSERT INTO resource_usage (resourceId, userId, isFinalized) VALUES (1, 1, 1)');
      await expect(
        runner.query('INSERT INTO resource_usage (resourceId, userId, isFinalized) VALUES (1, 2, 1)'),
      ).rejects.toThrow('Resource already has an active usage session');

      const migration = new ParallelMachineSessions1791900000000();
      await migration.up(runner);

      // The session that was running before the upgrade survives untouched.
      const survivor = 'SELECT id, resourceId, userId, endTime FROM resource_usage WHERE id = 1';
      expect(await runner.query(survivor)).toEqual([{ id: 1, resourceId: 1, userId: 1, endTime: null }]);

      expect(await runner.query('SELECT maxParallelSessions FROM resource')).toEqual([{ maxParallelSessions: 1 }]);
      // Different people may now share the machine; capacity is enforced by the lifecycle transaction.
      await runner.query('INSERT INTO resource_usage (resourceId, userId, isFinalized) VALUES (1, 2, 1)');
      await expect(
        runner.query('INSERT INTO resource_usage (resourceId, userId, isFinalized) VALUES (1, 2, 1)'),
      ).rejects.toThrow('User already has an active usage session');
      // Becoming published also counts (reservation finalized by update).
      await runner.query('INSERT INTO resource_usage (resourceId, userId, lifecyclePending) VALUES (1, 3, 1)');
      await expect(
        runner.query('INSERT INTO resource_usage (resourceId, userId, lifecyclePending) VALUES (1, 3, 1)'),
      ).rejects.toThrow('UNIQUE constraint');
      await runner.query('INSERT INTO resource_usage (resourceId, userId, lifecyclePending) VALUES (1, 4, 1)');
      await runner.query(
        'UPDATE resource_usage SET isFinalized = 1, lifecyclePending = 0 WHERE userId = 3 AND endTime IS NULL AND lifecyclePending = 1',
      );

      // Several lifecycles per resource, but never two for the same session.
      const attempt =
        'INSERT INTO resource_usage_lifecycle_attempt (id, resourceId, candidateUsageId, previousUsageId) VALUES (?, 1, ?, ?)';
      await runner.query(attempt, ['a', 10, null]);
      await runner.query(attempt, ['b', 11, null]);
      await runner.query(attempt, ['c', null, 12]);
      await expect(runner.query(attempt, ['d', 10, null])).rejects.toThrow('UNIQUE constraint');
      await expect(runner.query(attempt, ['e', null, 12])).rejects.toThrow('UNIQUE constraint');

      // Rolling back keeps the pre-existing running session too.
      await runner.query('DELETE FROM resource_usage WHERE id != 1');
      await migration.down(runner);
      expect(await runner.query(survivor)).toEqual([{ id: 1, resourceId: 1, userId: 1, endTime: null }]);
      expect(await runner.query('SELECT COUNT(*) AS c FROM resource_usage_lifecycle_attempt')).toEqual([{ c: 0 }]);
      expect((await runner.query('PRAGMA table_info(resource)')).map((c: { name: string }) => c.name)).not.toContain(
        'maxParallelSessions',
      );
    } finally {
      await runner.release();
      await source.destroy();
    }
  });
});
