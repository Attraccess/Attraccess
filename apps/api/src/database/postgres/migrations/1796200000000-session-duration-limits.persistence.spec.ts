import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { SessionDurationLimits1796200000000 } from './1796200000000-session-duration-limits';
import { postgresMigrations } from './index';

jest.setTimeout(120_000);

const RESOURCE_COLUMNS = [
  'maxSessionDurationMinutes',
  'requireSessionDurationEstimate',
  'defaultSessionDurationEstimateMinutes',
];
const USAGE_COLUMNS = ['autoEndAt', 'maxAutoEndAt', 'estimatedDurationMinutes', 'autoEndWarnedOffsetMinutes'];

describe('SessionDurationLimits1796200000000 (persistence)', () => {
  let source: DataSource;
  const migration = new SessionDurationLimits1796200000000();
  const run = async (direction: 'up' | 'down') => {
    const runner = source.createQueryRunner();
    try {
      await migration[direction](runner);
    } finally {
      await runner.release();
    }
  };
  const columnsOf = async (table: string, names: string[]) =>
    (
      await source.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name = ANY($2) ORDER BY column_name`,
        [table, names],
      )
    ).map((row: { column_name: string }) => row.column_name);

  beforeEach(async () => {
    const index = postgresMigrations.indexOf(SessionDurationLimits1796200000000);
    source = await createTestDataSource({ migrations: postgresMigrations.slice(0, index), migrationsRun: true });
    await source.query(`INSERT INTO "user" (id, username, email) VALUES (1, 'ada', 'ada@example.com')`);
    await source.query(`INSERT INTO "resource" (id, name, type) VALUES (1, 'Laser', 'machine'), (2, 'Door', 'door')`);
    await source.query(
      `INSERT INTO "resource_usage" (id, "usageAction", "resourceId", "userId", "startTime", "endTime", "isFinalized")
       VALUES (1, 'usage', 1, 1, now() - interval '2 hours', now() - interval '1 hour', true),
              (2, 'usage', 1, 1, now() - interval '10 minutes', NULL, true)`,
    );
  });
  afterEach(() => closeTestDataSource(source));

  it('gives existing resources no limit and no estimate', async () => {
    await run('up');

    expect(
      await source.query(
        `SELECT id, "maxSessionDurationMinutes", "requireSessionDurationEstimate", "defaultSessionDurationEstimateMinutes" FROM "resource" ORDER BY id`,
      ),
    ).toEqual([
      {
        id: 1,
        maxSessionDurationMinutes: null,
        requireSessionDurationEstimate: false,
        defaultSessionDurationEstimateMinutes: null,
      },
      {
        id: 2,
        maxSessionDurationMinutes: null,
        requireSessionDurationEstimate: false,
        defaultSessionDurationEstimateMinutes: null,
      },
    ]);
  });

  it('gives existing sessions, ended and running, no automatic end', async () => {
    await run('up');

    expect(
      await source.query(
        `SELECT id, "autoEndAt", "maxAutoEndAt", "estimatedDurationMinutes", "autoEndWarnedOffsetMinutes" FROM "resource_usage" ORDER BY id`,
      ),
    ).toEqual([
      { id: 1, autoEndAt: null, maxAutoEndAt: null, estimatedDurationMinutes: null, autoEndWarnedOffsetMinutes: null },
      { id: 2, autoEndAt: null, maxAutoEndAt: null, estimatedDurationMinutes: null, autoEndWarnedOffsetMinutes: null },
    ]);
  });

  it('defaults the estimate requirement of new resources to false', async () => {
    await run('up');
    await source.query(`INSERT INTO "resource" (id, name, type) VALUES (3, 'Lathe', 'machine')`);

    expect(await source.query(`SELECT "requireSessionDurationEstimate" FROM "resource" WHERE id = 3`)).toEqual([
      { requireSessionDurationEstimate: false },
    ]);
  });

  it('drops the columns and the index again, keeping the rows', async () => {
    await run('up');
    await run('down');

    expect(await columnsOf('resource', RESOURCE_COLUMNS)).toEqual([]);
    expect(await columnsOf('resource_usage', USAGE_COLUMNS)).toEqual([]);
    expect(await source.query(`SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_resource_usage_auto_end_at'`)).toEqual(
      [],
    );
    expect(await source.query(`SELECT count(*)::int AS count FROM "resource_usage"`)).toEqual([{ count: 2 }]);
  });
});
