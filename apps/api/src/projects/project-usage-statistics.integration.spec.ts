import {
  BillingTransaction,
  entities,
  ResourceUsage,
  ResourceUsageAction,
  Setting,
} from '@attraccess/database-entities';
import { DataSource } from 'typeorm';
import { ProjectAccessService } from './project-access.service';
import { ProjectUsageService } from './project-usage.service';

describe('ProjectUsageService usage stats (SQLite)', () => {
  let source: DataSource;
  let service: ProjectUsageService;

  const usage = (resourceId: number, projectId: number, startTime: string, endTime: string | null) =>
    source.getRepository(ResourceUsage).save({
      resourceId,
      projectId,
      userId: 1,
      usageAction: ResourceUsageAction.Usage,
      lifecyclePending: false,
      startTime: new Date(startTime),
      endTime: endTime ? new Date(endTime) : null,
    } as ResourceUsage);

  // Schema synchronization under CI coverage can exceed Jest's five-second default.
  beforeAll(async () => {
    source = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: Object.values(entities),
      synchronize: true,
    }).initialize();
    await source.query('PRAGMA foreign_keys = OFF');
    await source.query("INSERT INTO user (username, email) VALUES ('owner', 'owner@example.test')");
    await source.query("INSERT INTO project (userId, name) VALUES (1, 'Project'), (1, 'Other')");
    await source.query("INSERT INTO resource (id, name, type) VALUES (1, 'Lathe', 'machine'), (2, 'Laser', 'machine')");
    service = new ProjectUsageService(
      source.getRepository(ResourceUsage),
      source.getRepository(BillingTransaction),
      source.getRepository(Setting),
      { getAccessOrThrow: async () => undefined } as unknown as ProjectAccessService,
    );

    // shared machine: A 10-12 and B 11-13
    await usage(1, 1, '2024-01-01T10:00:00Z', '2024-01-01T12:00:00Z');
    await usage(1, 1, '2024-01-01T11:00:00Z', '2024-01-01T13:00:00Z');
    // another project on the same machine, and an open session: both ignored
    await usage(1, 2, '2024-01-01T09:00:00Z', '2024-01-01T14:00:00Z');
    await usage(1, 1, '2024-01-01T09:30:00Z', null);
    // touching sessions stay apart
    await usage(2, 1, '2024-01-02T10:00:00Z', '2024-01-02T11:00:00Z');
    await usage(2, 1, '2024-01-02T11:00:00Z', '2024-01-02T12:00:00Z');
    // a run crossing midnight UTC counts toward the day of its earliest session
    await usage(2, 1, '2024-01-03T23:00:00Z', '2024-01-04T01:00:00Z');
    await usage(2, 1, '2024-01-04T00:30:00Z', '2024-01-04T02:00:00Z');
  }, 30_000);

  afterAll(() => source.destroy());

  it('reports person and machine minutes per day and resource that add up to the totals', async () => {
    const { summary, timeSeries, topResources } = await service.getProjectUsageStats(1, 1, {});

    expect(summary.totalSessions).toBe(6);
    expect(summary.totalMinutes).toBeCloseTo(240 + 120 + 210, 3);
    expect(summary.totalMachineMinutes).toBeCloseTo(180 + 120 + 180, 3);
    expect(timeSeries.map(({ date, minutes, machineMinutes }) => [date, Math.round(minutes), machineMinutes])).toEqual([
      ['2024-01-01', 240, 180],
      ['2024-01-02', 120, 120],
      ['2024-01-03', 120, 180],
      ['2024-01-04', 90, 0],
    ]);
    expect(timeSeries.reduce((total, day) => total + day.machineMinutes, 0)).toBeCloseTo(summary.totalMachineMinutes);
    expect(
      topResources.map(({ resourceId, sessions, machineMinutes }) => [resourceId, sessions, machineMinutes]),
    ).toEqual([
      [2, 4, 300],
      [1, 2, 180],
    ]);
  });

  it('applies the date filter to the machine minutes as well', async () => {
    const { summary } = await service.getProjectUsageStats(1, 1, { startDate: new Date('2024-01-02T00:00:00Z') });

    expect(summary.totalMachineMinutes).toBeCloseTo(120 + 180, 3);
  });
});
