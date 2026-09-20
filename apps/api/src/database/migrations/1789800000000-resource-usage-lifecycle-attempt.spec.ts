import { DataSource } from 'typeorm';
import { ResourceUsageLifecycleAttempt1789800000000 } from './1789800000000-resource-usage-lifecycle-attempt';

describe('usage lifecycle reservation migration', () => {
  it('retains valid usage, hides reservations from the legacy view, and aborts reservations on downgrade', async () => {
    const source = await new DataSource({ type: 'sqlite', database: ':memory:', entities: [] }).initialize();
    const runner = source.createQueryRunner();
    try {
      await runner.query('CREATE TABLE resource (id integer PRIMARY KEY)');
      await runner.query(
        'CREATE TABLE resource_usage (id integer PRIMARY KEY, resourceId integer, usageInMinutes integer)',
      );
      await runner.query('CREATE TABLE typeorm_metadata (type text, name text, value text)');
      await runner.query(
        'CREATE VIEW resource_computed_view AS SELECT resourceId AS id, SUM(usageInMinutes) AS totalUsageMinutes FROM resource_usage GROUP BY resourceId',
      );
      await runner.query("INSERT INTO typeorm_metadata (type, name) VALUES ('VIEW', 'resource_computed_view')");
      await runner.query('INSERT INTO resource VALUES (1)');
      await runner.query('INSERT INTO resource_usage VALUES (1, 1, 10)');
      const migration = new ResourceUsageLifecycleAttempt1789800000000();
      await migration.up(runner);
      expect(await runner.query('SELECT lifecyclePending FROM resource_usage')).toEqual([{ lifecyclePending: 0 }]);
      await runner.query('INSERT INTO resource_usage VALUES (2, 1, -1, 1)');
      const insertAttempt =
        "INSERT INTO resource_usage_lifecycle_attempt (id,resourceId,kind,candidateUsageId,transitionTime,formSubmissions,billingItems) VALUES (?,1,'start',2,datetime('now'),'[]','[]')";
      await runner.query(insertAttempt, ['attempt-1']);
      await expect(runner.query(insertAttempt, ['attempt-2'])).rejects.toThrow('UNIQUE constraint');
      expect(await runner.query('SELECT * FROM resource_computed_view')).toEqual([{ id: 1, totalUsageMinutes: 10 }]);
      await migration.down(runner);
      expect(await runner.query('SELECT * FROM resource_usage')).toEqual([
        { id: 1, resourceId: 1, usageInMinutes: 10 },
      ]);
      expect(await runner.query('SELECT * FROM resource_computed_view')).toEqual([{ id: 1, totalUsageMinutes: 10 }]);
      expect(await runner.hasTable('resource_usage_lifecycle_attempt')).toBe(false);
    } finally {
      await runner.release();
      await source.destroy();
    }
  });
});
