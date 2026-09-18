import { DataSource, EntitySchema } from 'typeorm';
import { buildScheduleEvaluationQuery, formatDbDate } from './maintenance-schedule-evaluator.service';

/**
 * Exercises the usage-aggregate SQL against a real SQLite database.
 *
 * The mocked unit tests can't catch this class of bug: a malformed SQL expression or a baseline
 * string that doesn't match how TypeORM serialises `datetime` columns both fail silently, returning
 * 0 instead of an error — which means usage-based maintenance would simply never trigger.
 */

// Mirrors the columns of ResourceUsage that the aggregate touches, including the generated column.
const UsageSchema = new EntitySchema<{
  id: number;
  resourceId: number;
  startTime: Date;
  endTime: Date | null;
  usageInMinutes: number;
  attributedOperatingDurationInMinutes: number | null;
}>({
  name: 'resource_usage',
  columns: {
    id: { type: Number, primary: true, generated: true },
    resourceId: { type: 'integer' },
    startTime: { type: 'datetime' },
    endTime: { type: 'datetime', nullable: true },
    usageInMinutes: {
      type: 'integer',
      generatedType: 'STORED',
      asExpression: `CASE WHEN "endTime" IS NULL THEN -1 ELSE (julianday("endTime") - julianday("startTime")) * 1440 END`,
      insert: false,
      update: false,
    },
    attributedOperatingDurationInMinutes: { type: 'integer', nullable: true },
  },
});

const MaintenanceSchema = new EntitySchema<{
  id: number;
  resourceId: number;
  maintenanceScheduleId: number;
  startTime: Date;
  endTime: Date | null;
}>({
  name: 'resource_maintenance',
  columns: {
    id: { type: Number, primary: true, generated: true },
    resourceId: { type: 'integer' },
    maintenanceScheduleId: { type: 'integer' },
    startTime: { type: 'datetime' },
    endTime: { type: 'datetime', nullable: true },
  },
});

describe('buildScheduleEvaluationQuery (real sqlite)', () => {
  let dataSource: DataSource;

  const RESOURCE = 1;
  const SCHEDULE_NEW = 100; // never serviced -> old baseline
  const SCHEDULE_RECENT = 200; // serviced recently -> recent baseline

  const oldBaseline = new Date('2025-01-01T00:00:00.000Z');
  const recentBaseline = new Date('2026-06-01T12:00:00.000Z');

  beforeEach(async () => {
    dataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [UsageSchema, MaintenanceSchema],
    });
    await dataSource.initialize();

    const repo = dataSource.getRepository<{
      resourceId: number;
      startTime: Date;
      endTime: Date | null;
      attributedOperatingDurationInMinutes: number | null;
    }>('resource_usage');
    // Saving through TypeORM means endTime is serialised exactly as it is in production.
    await repo.save([
      // 60 min, before the recent baseline -> only SCHEDULE_NEW should see it
      {
        resourceId: RESOURCE,
        startTime: new Date('2025-03-01T10:00:00.000Z'),
      endTime: new Date('2025-03-01T11:00:00.000Z'),
      attributedOperatingDurationInMinutes: 12,
      },
      // 30 min, exactly at the recent baseline -> boundary must be inclusive for both
      {
        resourceId: RESOURCE,
        startTime: new Date('2026-06-01T11:30:00.000Z'),
        endTime: recentBaseline,
        attributedOperatingDurationInMinutes: 6,
      },
      // 15 min, after both baselines
      {
        resourceId: RESOURCE,
        startTime: new Date('2026-07-01T09:45:00.000Z'),
        endTime: new Date('2026-07-01T10:00:00.000Z'),
        attributedOperatingDurationInMinutes: 3,
      },
      // still running -> excluded (endTime IS NULL)
      { resourceId: RESOURCE, startTime: new Date('2026-07-02T09:00:00.000Z'), endTime: null },
      // different resource -> never counted
      { resourceId: 2, startTime: new Date('2026-07-01T00:00:00.000Z'), endTime: new Date('2026-07-01T05:00:00.000Z') },
    ]);
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  const runAggregate = (pairs: Array<[number, number, Date]>) =>
    dataSource.query(buildScheduleEvaluationQuery('resource_maintenance', 'resource_usage', pairs.length), [
      ...pairs.flatMap(([resourceId, scheduleId, baseline]) => [resourceId, scheduleId, formatDbDate(baseline)]),
      formatDbDate(new Date()),
    ]);

  it('aggregates each (resource, schedule) pair against its own baseline', async () => {
    const rows = await runAggregate([
      [RESOURCE, SCHEDULE_NEW, oldBaseline],
      [RESOURCE, SCHEDULE_RECENT, recentBaseline],
    ]);

    const bySchedule = new Map<number, { totalMinutes: number; totalOperatingMinutes: number; totalCount: number }>(
      rows.map((r: { scheduleId: number }) => [r.scheduleId, r]),
    );

    // usageInMinutes is derived from julianday() arithmetic, so totals are fractional.
    // 60 + 30 + 15 across three completed sessions
    expect(bySchedule.get(SCHEDULE_NEW)?.totalMinutes).toBeCloseTo(105, 3);
    expect(bySchedule.get(SCHEDULE_NEW)?.totalOperatingMinutes).toBe(21);
    expect(bySchedule.get(SCHEDULE_NEW)?.totalCount).toBe(3);
    // Only the two sessions at/after the recent baseline — proves baselines aren't collapsed per resource
    expect(bySchedule.get(SCHEDULE_RECENT)?.totalMinutes).toBeCloseTo(45, 3);
    expect(bySchedule.get(SCHEDULE_RECENT)?.totalOperatingMinutes).toBe(9);
    expect(bySchedule.get(SCHEDULE_RECENT)?.totalCount).toBe(2);
  });

  it('uses the latest completed maintenance as the schedule baseline', async () => {
    await dataSource.getRepository('resource_maintenance').save({
      resourceId: RESOURCE,
      maintenanceScheduleId: SCHEDULE_RECENT,
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: recentBaseline,
    });

    const rows = await runAggregate([
      [RESOURCE, SCHEDULE_NEW, oldBaseline],
      [RESOURCE, SCHEDULE_RECENT, oldBaseline],
    ]);
    const bySchedule = new Map<number, { baseline: string; totalMinutes: number; totalCount: number }>(
      rows.map((row: { scheduleId: number }) => [row.scheduleId, row]),
    );

    expect(bySchedule.get(SCHEDULE_RECENT)).toMatchObject({
      baseline: formatDbDate(recentBaseline),
      totalMinutes: expect.closeTo(45, 3),
      totalOperatingMinutes: 9,
      totalCount: 2,
    });
  });

  it('returns zeroes rather than dropping a pair when a resource has no matching usage', async () => {
    const rows = await runAggregate([[999, SCHEDULE_NEW, oldBaseline]]);

    expect(rows).toEqual([
      {
        resourceId: 999,
        scheduleId: SCHEDULE_NEW,
        baseline: formatDbDate(oldBaseline),
        hasActiveMaintenance: 0,
        totalMinutes: 0,
        totalOperatingMinutes: 0,
        totalCount: 0,
      },
    ]);
  });

  it('matches the stored datetime format, so a baseline in the future excludes everything', async () => {
    const rows = await runAggregate([[RESOURCE, SCHEDULE_NEW, new Date('2030-01-01T00:00:00.000Z')]]);

    expect(rows[0]).toMatchObject({ totalMinutes: 0, totalOperatingMinutes: 0, totalCount: 0 });
  });
});
