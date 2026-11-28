import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { ProjectSwitch1796500000200 } from './1796500000200-project-switch';
import { postgresMigrations } from './index';

jest.setTimeout(120_000);

describe('ProjectSwitch1796500000200 (persistence)', () => {
  let source: DataSource;
  const migration = new ProjectSwitch1796500000200();
  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  };

  beforeEach(async () => {
    const index = postgresMigrations.indexOf(ProjectSwitch1796500000200);
    source = await createTestDataSource({ migrations: postgresMigrations.slice(0, index), migrationsRun: true });
    await source.query(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
    await source.query(`INSERT INTO "resource" (id, name, type) VALUES (1, 'Laser', 'machine')`);
    await source.query(
      `INSERT INTO "resource_billing_configuration" ("resourceId", "creditsPerUsage", "creditsPerMinute") VALUES (1, 5, 2)`,
    );
    await source.query(`INSERT INTO "form" (id, name, "resourceId") VALUES (1, 'Safety', 1)`);
    await source.query(
      `INSERT INTO "resource_usage" (id, "usageAction", "resourceId", "userId", "startTime", "endTime", "isFinalized")
       VALUES (1, 'usage', 1, 1, now() - interval '2 hours', now() - interval '1 hour', true),
              (2, 'usage', 1, 1, now() - interval '10 minutes', NULL, true)`,
    );
  });
  afterEach(() => closeTestDataSource(source));

  it('keeps every existing session unlinked, resources continuing sessions and forms not asked on a switch', async () => {
    await run('up');

    expect(
      await source.query(
        `SELECT id, "previousUsageId", "projectSwitchCharging", "sessionStartTime" FROM "resource_usage" ORDER BY id`,
      ),
    ).toEqual([
      { id: 1, previousUsageId: null, projectSwitchCharging: null, sessionStartTime: null },
      { id: 2, previousUsageId: null, projectSwitchCharging: null, sessionStartTime: null },
    ]);
    expect(await source.query(`SELECT "projectSwitchCharging" FROM "resource_billing_configuration"`)).toEqual([
      { projectSwitchCharging: 'continue' },
    ]);
    expect(await source.query(`SELECT "isRequiredOnResourceUsageProjectSwitch" AS required FROM "form"`)).toEqual([
      { required: false },
    ]);
    expect(await source.query(`SELECT "isRequiredOnResourceUsageProjectReassign" AS required FROM "form"`)).toEqual([
      { required: false },
    ]);
  });

  it('allows one continuation per part and keeps it when the part is deleted', async () => {
    await run('up');
    await source.query(`UPDATE "resource_usage" SET "previousUsageId" = 1 WHERE id = 2`);

    await expect(
      source.query(
        `INSERT INTO "resource_usage" (id, "usageAction", "resourceId", "userId", "startTime", "endTime", "isFinalized", "previousUsageId")
         VALUES (3, 'usage', 1, 1, now(), now(), true, 1)`,
      ),
    ).rejects.toThrow('IDX_resource_usage_previous_usage');
    await source.query(`DELETE FROM "resource_usage" WHERE id = 1`);
    expect(await source.query(`SELECT "previousUsageId" FROM "resource_usage" WHERE id = 2`)).toEqual([
      { previousUsageId: null },
    ]);
  });

  it('can be taken back, keeping the rows', async () => {
    await run('up');
    await run('down');

    expect(
      await source.query(
        `SELECT column_name FROM information_schema.columns
         WHERE column_name IN ('previousUsageId', 'projectSwitchCharging', 'sessionStartTime', 'isRequiredOnResourceUsageProjectSwitch', 'isRequiredOnResourceUsageProjectReassign')
           AND table_name IN ('resource_usage', 'resource_billing_configuration', 'form', 'form_resource_override')`,
      ),
    ).toEqual([]);
    expect(await source.query(`SELECT count(*)::int AS count FROM "resource_usage"`)).toEqual([{ count: 2 }]);
  });
});
