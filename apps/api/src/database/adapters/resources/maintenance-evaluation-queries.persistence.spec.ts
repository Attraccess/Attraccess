import {
  Resource,
  ResourceMaintenance,
  ResourceMaintenanceSchedule,
  ResourceUsage,
} from '@attraccess/database-entities';
import {
  ResourceMaintenanceScheduleTriggerType,
  ResourceType,
  ResourceUsageAction,
} from '@attraccess/application-models';
import type { DataSource } from 'typeorm';
import { closeTestDataSource, createTestDataSource } from '../../../test-utils/test-database';
import { buildScheduleEvaluationQuery, buildScheduleStateQuery } from './maintenance-evaluation-queries';

/**
 * Exercises the usage-aggregate SQL against the real PostgreSQL schema.
 *
 * The mocked unit tests can't catch this class of bug: a malformed SQL expression, an unquoted camelCase identifier
 * or a mistyped CTE column returns 0 or fails silently, which means usage-based maintenance would simply never
 * trigger.
 */
describe('buildScheduleEvaluationQuery (real PostgreSQL)', () => {
  let dataSource: DataSource;

  const RESOURCE = 1;
  let scheduleNew: number; // never serviced -> old baseline
  let scheduleRecent: number; // serviced recently -> recent baseline

  const oldBaseline = new Date('2025-01-01T00:00:00.000Z');
  const recentBaseline = new Date('2026-06-01T12:00:00.000Z');

  beforeEach(async () => {
    dataSource = await createTestDataSource();
    await dataSource.getRepository(Resource).save([
      { name: 'Laser', type: ResourceType.Machine },
      { name: 'Saw', type: ResourceType.Machine },
    ]);
    const schedules = await dataSource.getRepository(ResourceMaintenanceSchedule).save(
      ['New', 'Recent'].map((name) => ({
        resourceId: RESOURCE,
        name,
        triggerType: ResourceMaintenanceScheduleTriggerType.USAGE_COUNT,
        enabled: true,
      })),
    );
    [scheduleNew, scheduleRecent] = schedules.map((schedule) => schedule.id);

    const usage = (fields: Partial<ResourceUsage>) =>
      ({ usageAction: ResourceUsageAction.Usage, isFinalized: true, ...fields }) as ResourceUsage;
    await dataSource.getRepository(ResourceUsage).save([
      // 60 min, before the recent baseline -> only the never serviced schedule should see it
      usage({
        resourceId: RESOURCE,
        startTime: new Date('2025-03-01T10:00:00.000Z'),
        endTime: new Date('2025-03-01T11:00:00.000Z'),
        attributedOperatingDurationInMinutes: 12,
      }),
      // 30 min, exactly at the recent baseline -> boundary must be inclusive for both
      usage({
        resourceId: RESOURCE,
        startTime: new Date('2026-06-01T11:30:00.000Z'),
        endTime: recentBaseline,
        attributedOperatingDurationInMinutes: 6,
      }),
      // 15 min, after both baselines
      usage({
        resourceId: RESOURCE,
        startTime: new Date('2026-07-01T09:45:00.000Z'),
        endTime: new Date('2026-07-01T10:00:00.000Z'),
        attributedOperatingDurationInMinutes: 3,
      }),
      // still running -> excluded (endTime IS NULL)
      usage({ resourceId: RESOURCE, startTime: new Date('2026-07-02T09:00:00.000Z'), endTime: null }),
      // pending reservation -> excluded
      usage({
        resourceId: RESOURCE,
        startTime: new Date('2026-07-03T09:00:00.000Z'),
        endTime: new Date('2026-07-03T09:05:00.000Z'),
        isFinalized: false,
        lifecyclePending: true,
      }),
      // different resource -> never counted
      usage({
        resourceId: 2,
        startTime: new Date('2026-07-01T00:00:00.000Z'),
        endTime: new Date('2026-07-01T05:00:00.000Z'),
      }),
    ]);
  });

  afterEach(async () => {
    await closeTestDataSource(dataSource);
  });

  const pairParams = (pairs: Array<[number, number, Date]>) => [
    ...pairs.flatMap(([resourceId, scheduleId, baseline]) => [resourceId, scheduleId, baseline]),
    new Date(),
  ];
  const runAggregate = (pairs: Array<[number, number, Date]>) =>
    dataSource.query(
      buildScheduleEvaluationQuery('resource_maintenance', 'resource_usage', pairs.length),
      pairParams(pairs),
    );

  it('aggregates each (resource, schedule) pair against its own baseline', async () => {
    const rows = await runAggregate([
      [RESOURCE, scheduleNew, oldBaseline],
      [RESOURCE, scheduleRecent, recentBaseline],
    ]);

    const bySchedule = new Map<number, { totalCount: number }>(
      rows.map((r: { scheduleId: number }) => [r.scheduleId, r]),
    );

    // Preserve usage-count behavior: three completed sessions across the original cycle.
    expect(Number(bySchedule.get(scheduleNew)?.totalCount)).toBe(3);
    // Only the two sessions at/after the recent baseline — proves baselines aren't collapsed per resource
    expect(Number(bySchedule.get(scheduleRecent)?.totalCount)).toBe(2);
  });

  it('counts a session whose project was switched twice as one use, like an unswitched one', async () => {
    const repository = dataSource.getRepository(ResourceUsage);
    let previousUsageId: number | null = null;
    const at = (hour: number) => new Date(Date.UTC(2026, 7, 1, hour));
    for (const hour of [9, 10, 11]) {
      const part: ResourceUsage = await repository.save({
        resourceId: RESOURCE,
        usageAction: ResourceUsageAction.Usage,
        isFinalized: true,
        startTime: at(hour - 1),
        endTime: at(hour),
        previousUsageId,
      } as ResourceUsage);
      previousUsageId = part.id;
    }

    const [row] = await runAggregate([[RESOURCE, scheduleRecent, recentBaseline]]);

    // The two unswitched sessions after the baseline, and the switched one once.
    expect(Number(row.totalCount)).toBe(3);
  });

  it('uses the latest completed maintenance as the schedule baseline', async () => {
    await dataSource.getRepository(ResourceMaintenance).save({
      resourceId: RESOURCE,
      maintenanceSchedule: { id: scheduleRecent },
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: recentBaseline,
      reason: null,
    });

    const rows = await runAggregate([
      [RESOURCE, scheduleNew, oldBaseline],
      [RESOURCE, scheduleRecent, oldBaseline],
    ]);
    const bySchedule = new Map<number, { baseline: Date; totalCount: number }>(
      rows.map((row: { scheduleId: number }) => [row.scheduleId, row]),
    );

    expect(bySchedule.get(scheduleRecent)?.baseline).toEqual(recentBaseline);
    expect(Number(bySchedule.get(scheduleRecent)?.totalCount)).toBe(2);
  });

  it('returns zeroes rather than dropping a pair when a resource has no matching usage', async () => {
    const rows = await runAggregate([[999, scheduleNew, oldBaseline]]);

    expect(rows).toEqual([
      {
        resourceId: 999,
        scheduleId: scheduleNew,
        baseline: oldBaseline,
        hasActiveMaintenance: false,
        totalCount: 0,
      },
    ]);
  });

  it('compares timestamps, so a baseline in the future excludes everything', async () => {
    const rows = await runAggregate([[RESOURCE, scheduleNew, new Date('2030-01-01T00:00:00.000Z')]]);

    expect(rows[0]).toMatchObject({ totalCount: 0 });
  });

  it('reports a maintenance that started and has not ended, from the state query too', async () => {
    await dataSource.getRepository(ResourceMaintenance).save({
      resourceId: RESOURCE,
      maintenanceSchedule: { id: scheduleNew },
      startTime: new Date('2026-06-01T10:00:00.000Z'),
      endTime: null,
      reason: null,
    });

    const [state] = await dataSource.query(
      buildScheduleStateQuery('resource_maintenance', 1),
      pairParams([[RESOURCE, scheduleNew, oldBaseline]]),
    );

    expect(state).toEqual({
      resourceId: RESOURCE,
      scheduleId: scheduleNew,
      baseline: oldBaseline,
      hasActiveMaintenance: true,
    });
  });
});
