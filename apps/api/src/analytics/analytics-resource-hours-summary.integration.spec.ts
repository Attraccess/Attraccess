import {
  BillingTransaction,
  entities,
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
  ResourceUsageLifecycleAttempt,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { ResourceOperatingAttributionService } from '../resources/operating-intervals/resource-operating-attribution.service';
import { AnalyticsService } from './analytics.service';

const HOUR = 3_600_000;
const FEBRUARY = { start: new Date('2024-02-01T00:00:00Z'), end: new Date('2024-03-01T00:00:00Z') };

describe('AnalyticsService resource hours summary (SQLite)', () => {
  let source: DataSource;
  let attribution: ResourceOperatingAttributionService;
  let service: AnalyticsService;

  const usage = (
    resourceId: number,
    startTime: string,
    endTime: string | null,
    overrides: Partial<ResourceUsage> = {},
  ) =>
    source.getRepository(ResourceUsage).save({
      resourceId,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      lifecyclePending: false,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
      ...overrides,
    } as ResourceUsage);
  const interval = (resourceId: number, startTime: string, endTime: string | null) =>
    source.getRepository(ResourceOperatingInterval).save({
      resourceId,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
    } as ResourceOperatingInterval);

  // Schema synchronization under CI coverage can exceed Jest's five-second default.
  beforeEach(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source.query('PRAGMA foreign_keys = OFF');
    await source.query("INSERT INTO user (username, email) VALUES ('owner', 'owner@example.test')");
    attribution = new ResourceOperatingAttributionService(
      source.getRepository(ResourceOperatingInterval),
      source.getRepository(ResourceUsage),
      source.getRepository(ResourceUsageLifecycleAttempt),
    );
    service = new AnalyticsService(
      source.getRepository(ResourceUsage),
      source.getRepository(BillingTransaction),
      source.getRepository(Resource),
      attribution,
    );
  }, 30_000);

  afterEach(() => source.destroy());

  const addResources = async (count: number) => {
    for (let id = 1; id <= count; id++) {
      await source.query("INSERT INTO resource (id, name, type) VALUES (?, ?, 'machine')", [id, `R${id}`]);
    }
  };

  it('lists the resources active in the range with clipped person and machine hours', async () => {
    await addResources(8);
    await source.query('UPDATE resource SET metadata = ? WHERE id = 4', [JSON.stringify({ costCenter: '4711' })]);
    // 4: shared machine, A 10-12 and B 11-13
    await usage(4, '2024-02-10T10:00:00Z', '2024-02-10T12:00:00Z');
    await usage(4, '2024-02-10T11:00:00Z', '2024-02-10T13:00:00Z');
    // 5 and 6: only a pending session and a door unlock
    await usage(5, '2024-02-10T10:00:00Z', '2024-02-10T12:00:00Z', { lifecyclePending: true });
    await usage(6, '2024-02-10T10:00:00Z', '2024-02-10T12:00:00Z', { usageAction: ResourceUsageAction.DoorUnlock });
    // 7: spans the range start, stored without milliseconds
    await source.query(
      "INSERT INTO resource_usage (usageAction, resourceId, userId, startTime, endTime, lifecyclePending) VALUES ('usage', 7, 1, '2024-01-31 23:00:00', '2024-02-01 01:00:00', 0)",
    );
    // 8: only an operating interval spanning the range end (2024 is a leap year: 25 h fall inside the range)
    await interval(8, '2024-02-28T23:00:00Z', '2024-03-01T01:00:00Z');
    // records that only touch the range
    await interval(2, '2024-01-31T20:00:00Z', '2024-02-01T00:00:00Z');
    await usage(1, '2024-03-01T00:00:00Z', '2024-03-01T01:00:00Z');
    await usage(3, '2024-01-31T22:00:00Z', '2024-02-01T00:00:00Z');

    const [rows, total] = await service.getResourceHoursSummaryInDateRange(FEBRUARY, 1, 500);

    expect(total).toBe(3);
    expect(rows).toEqual([
      {
        resourceId: 4,
        resourceName: 'R4',
        metadata: { costCenter: '4711' },
        sessionCount: 2,
        personDurationMs: 4 * HOUR,
        sessionDurationMs: 3 * HOUR,
        operatingDataAvailable: false,
        operatingDurationMs: null,
        unattributedOperatingDurationMs: null,
        isProvisional: false,
      },
      expect.objectContaining({ resourceId: 7, sessionCount: 1, personDurationMs: HOUR, sessionDurationMs: HOUR }),
      expect.objectContaining({
        resourceId: 8,
        sessionCount: 0,
        personDurationMs: 0,
        operatingDataAvailable: true,
        operatingDurationMs: 25 * HOUR,
        unattributedOperatingDurationMs: 25 * HOUR,
      }),
    ]);
    // no user data in the rows
    expect(rows.flatMap((row) => Object.keys(row))).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/user|email|attribution/i)]),
    );
  });

  it('adds up ranges longer than one report window exactly', async () => {
    await addResources(1);
    // overlapping sessions across the first window boundary (2024-01-01 + 31 days = 2024-02-01)
    await usage(1, '2024-01-31T22:00:00Z', '2024-02-01T02:00:00Z');
    await usage(1, '2024-01-31T23:00:00Z', '2024-02-01T01:00:00Z');
    // running for 70 days across two window boundaries, with 6 h of sessions inside
    await interval(1, '2024-01-15T00:00:00Z', '2024-03-25T00:00:00Z');
    const range = { start: new Date('2024-01-01T00:00:00Z'), end: new Date('2024-04-01T00:00:00Z') };
    const getForResources = jest.spyOn(attribution, 'getForResources');

    const [[row]] = await service.getResourceHoursSummaryInDateRange(range, 1, 500);

    expect(getForResources).toHaveBeenCalledTimes(3);
    expect(row).toMatchObject({
      sessionCount: 2,
      personDurationMs: 6 * HOUR,
      sessionDurationMs: 4 * HOUR,
      operatingDurationMs: 70 * 24 * HOUR,
      unattributedOperatingDurationMs: 70 * 24 * HOUR - 4 * HOUR,
    });
  });

  it('derives at most 100 resources at a time and paginates over resources', async () => {
    await addResources(105);
    for (let id = 1; id <= 105; id++) {
      await usage(id, '2024-02-10T10:00:00Z', '2024-02-10T11:00:00Z');
    }
    const getForResources = jest.spyOn(attribution, 'getForResources');

    const [rows, total] = await service.getResourceHoursSummaryInDateRange(FEBRUARY, 1, 500);
    const [secondPage, secondTotal] = await service.getResourceHoursSummaryInDateRange(FEBRUARY, 2, 100);

    expect(total).toBe(105);
    expect(rows).toHaveLength(105);
    expect(rows.every((row) => row.personDurationMs === HOUR && row.sessionCount === 1)).toBe(true);
    expect(getForResources.mock.calls.slice(0, 2).map(([ids]) => ids.length)).toEqual([100, 5]);
    expect(secondPage.map((row) => row.resourceId)).toEqual([101, 102, 103, 104, 105]);
    expect(secondTotal).toBe(105);
  });

  it('marks a range that has not ended provisional and returns nothing for an empty range', async () => {
    await addResources(1);
    await usage(1, '2024-02-10T10:00:00Z', null);

    const [open] = await service.getResourceHoursSummaryInDateRange(
      { start: FEBRUARY.start, end: new Date(Date.now() + HOUR) },
      1,
      500,
    );
    const [reversed, reversedTotal] = await service.getResourceHoursSummaryInDateRange(
      { start: FEBRUARY.end, end: FEBRUARY.start },
      1,
      500,
    );

    expect(open[0]).toMatchObject({ resourceId: 1, sessionCount: 1, isProvisional: true });
    expect([reversed, reversedTotal]).toEqual([[], 0]);
  });

  it('keeps deleted resources and skips the empty windows before the first activity', async () => {
    await addResources(2);
    await usage(1, '2024-02-10T10:00:00Z', '2024-02-10T11:00:00Z');
    await usage(2, '2024-02-10T10:00:00Z', '2024-02-10T12:00:00Z');
    await source.query("UPDATE resource SET deletedAt = '2024-02-20 00:00:00' WHERE id = 2");
    const getForResources = jest.spyOn(attribution, 'getForResources');

    const [rows, total] = await service.getResourceHoursSummaryInDateRange(
      { start: new Date('1900-01-01T00:00:00Z'), end: FEBRUARY.end },
      1,
      500,
    );

    expect(total).toBe(2);
    expect(rows.map(({ resourceName, personDurationMs }) => [resourceName, personDurationMs])).toEqual([
      ['R1', HOUR],
      ['R2', 2 * HOUR],
    ]);
    expect(getForResources).toHaveBeenCalledTimes(1);
  });
});
