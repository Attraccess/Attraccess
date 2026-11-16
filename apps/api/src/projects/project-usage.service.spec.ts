import { Test } from '@nestjs/testing';
import type { ProjectUsageAggregates } from '@attraccess/application-models';
import { ProjectUsageService } from './project-usage.service';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { mergeSessionsIntoRuns, sumMachineMinutes } from './project-usage-statistics';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_USAGE_STORE } from './project.port';

const usageSession = (resourceId: number, startTime: string, endTime: string) => ({
  resourceId,
  startTime: new Date(startTime),
  endTime: new Date(endTime),
});

const aggregates = (overrides: Partial<ProjectUsageAggregates>): ProjectUsageAggregates => ({
  summary: { totalSessions: 0, totalMinutes: 0 },
  perResource: [],
  timeSeries: [],
  sessions: [],
  spend: { total: 0, perResource: [], timeSeries: [] },
  ...overrides,
});

describe('ProjectUsageService', () => {
  let service: ProjectUsageService;
  const usageStore = {
    listUsageHistory: jest.fn(),
    readAggregates: jest.fn(),
    readBillingCurrency: jest.fn(),
  };
  const projectAccessService = {
    getAccessOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectUsageService,
        { provide: PROJECT_USAGE_STORE, useValue: usageStore },
        { provide: ProjectAccessService, useValue: projectAccessService },
      ],
    }).compile();

    service = moduleRef.get(ProjectUsageService);
  });

  describe('getProjectUsageHistory', () => {
    it('returns paginated history with nextPage when more results exist', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      usageStore.listUsageHistory.mockResolvedValue({ data: [{ id: 1 }], total: 3 });

      const result = await service.getProjectUsageHistory(1, 5, {
        page: 1,
        limit: 1,
      } as GetProjectUsageHistoryQueryDto);

      expect(projectAccessService.getAccessOrThrow).toHaveBeenCalledWith(1, 5);
      expect(usageStore.listUsageHistory).toHaveBeenCalledWith(
        5,
        { startDate: undefined, endDate: undefined },
        { page: 1, limit: 1 },
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.nextPage).toBe(2);
    });
  });

  describe('getProjectUsageStats', () => {
    it('aggregates summary, time series, and top resources; without overlaps machine minutes equal person minutes', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      usageStore.readBillingCurrency.mockResolvedValue('EUR');
      usageStore.readAggregates.mockResolvedValue(
        aggregates({
          summary: { totalSessions: 3, totalMinutes: 60 },
          sessions: [
            usageSession(1, '2024-01-01T10:00:00Z', '2024-01-01T10:15:00Z'),
            usageSession(1, '2024-01-02T10:00:00Z', '2024-01-02T10:30:00Z'),
            usageSession(2, '2024-01-02T11:00:00Z', '2024-01-02T11:15:00Z'),
          ],
          perResource: [
            { resourceId: 1, resourceName: 'Laser Cutter', sessions: 2, minutes: 45 },
            { resourceId: 2, resourceName: 'CNC', sessions: 1, minutes: 15 },
          ],
          timeSeries: [
            { date: '2024-01-01', sessions: 1, minutes: 15 },
            { date: '2024-01-02', sessions: 2, minutes: 45 },
          ],
          spend: {
            total: 300,
            perResource: [
              { resourceId: 1, spend: 200 },
              { resourceId: 2, spend: 100 },
            ],
            timeSeries: [
              { date: '2024-01-01', spend: 120 },
              { date: '2024-01-02', spend: 180 },
            ],
          },
        }),
      );

      const result = await service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto);

      expect(result.summary).toEqual({
        totalSessions: 3,
        totalMinutes: 60,
        totalMachineMinutes: 60,
        totalSpend: 300,
        currency: 'EUR',
        minorUnit: 2,
      });
      expect(result.topResources).toHaveLength(2);
      expect(result.topResources[0]).toEqual({
        resourceId: 1,
        resourceName: 'Laser Cutter',
        sessions: 2,
        minutes: 45,
        machineMinutes: 45,
        spend: 200,
      });
      expect(result.timeSeries).toEqual([
        { date: '2024-01-01', sessions: 1, minutes: 15, machineMinutes: 15, spend: 120 },
        { date: '2024-01-02', sessions: 2, minutes: 45, machineMinutes: 45, spend: 180 },
      ]);
    });

    it('counts overlapping sessions of a shared machine once as machine minutes', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      usageStore.readBillingCurrency.mockResolvedValue('EUR');
      usageStore.readAggregates.mockResolvedValue(
        aggregates({
          summary: { totalSessions: 2, totalMinutes: 240 },
          sessions: [
            usageSession(1, '2024-01-01T10:00:00Z', '2024-01-01T12:00:00Z'),
            usageSession(1, '2024-01-01T11:00:00Z', '2024-01-01T13:00:00Z'),
          ],
          perResource: [{ resourceId: 1, resourceName: 'Laser Cutter', sessions: 2, minutes: 240 }],
          timeSeries: [{ date: '2024-01-01', sessions: 2, minutes: 240 }],
        }),
      );

      const result = await service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto);

      expect(result.summary).toMatchObject({ totalMinutes: 240, totalMachineMinutes: 180 });
      expect(result.topResources[0]).toMatchObject({ minutes: 240, machineMinutes: 180 });
      expect(result.timeSeries[0]).toMatchObject({ minutes: 240, machineMinutes: 180 });
    });

    it('defaults to EUR and passes the date range to the store', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      usageStore.readBillingCurrency.mockResolvedValue(null);
      usageStore.readAggregates.mockResolvedValue(aggregates({}));
      const startDate = new Date('2024-01-02T00:00:00Z');

      const result = await service.getProjectUsageStats(1, 5, { startDate } as ProjectUsageStatsQueryDto);

      expect(usageStore.readAggregates).toHaveBeenCalledWith(5, { startDate, endDate: undefined });
      expect(result.summary).toMatchObject({ currency: 'EUR', minorUnit: 2, totalSessions: 0, totalSpend: 0 });
    });

    it('checks project access before reading statistics', async () => {
      projectAccessService.getAccessOrThrow.mockRejectedValue(new Error('denied'));

      await expect(service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto)).rejects.toThrow('denied');
      expect(usageStore.readAggregates).not.toHaveBeenCalled();
    });
  });
});

describe('mergeSessionsIntoRuns', () => {
  const session = (resourceId: number, start: string, end: string | null) => ({
    resourceId,
    startTime: new Date(`2024-01-01T${start}:00Z`),
    endTime: end ? new Date(`2024-01-01T${end}:00Z`) : null,
  });

  it('merges strictly overlapping sessions of one resource into a run attributed to the earliest start', () => {
    const runs = mergeSessionsIntoRuns([
      session(1, '11:00', '13:00'),
      session(1, '10:00', '12:00'),
      session(1, '12:30', '13:30'),
    ]);

    expect(runs).toEqual([{ resourceId: 1, startTime: new Date('2024-01-01T10:00:00Z'), minutes: 210 }]);
  });

  it('keeps sessions that only touch apart', () => {
    const runs = mergeSessionsIntoRuns([session(1, '10:00', '11:00'), session(1, '11:00', '12:00')]);

    expect(runs.map((run) => run.minutes)).toEqual([60, 60]);
  });

  it('never merges across resources and ignores sessions without an end', () => {
    const runs = mergeSessionsIntoRuns([
      session(1, '10:00', '12:00'),
      session(2, '11:00', '13:00'),
      session(1, '11:00', null),
    ]);

    expect(runs.map((run) => [run.resourceId, run.minutes])).toEqual([
      [1, 120],
      [2, 120],
    ]);
  });

  it('keeps a long session intact when shorter ones are nested inside it', () => {
    const runs = mergeSessionsIntoRuns([session(1, '10:00', '14:00'), session(1, '11:00', '12:00')]);

    expect(runs.map((run) => run.minutes)).toEqual([240]);
  });
});

describe('sumMachineMinutes', () => {
  const session = (resourceId: number, start: string, end: string) => ({
    resourceId,
    startTime: new Date(start),
    endTime: new Date(end),
  });

  it('counts a run crossing midnight UTC toward the day of its earliest session, so the days add up', () => {
    const { machineMinutesByDate, machineMinutesByResource, totalMachineMinutes } = sumMachineMinutes([
      session(1, '2024-01-03T23:00:00Z', '2024-01-04T01:00:00Z'),
      session(1, '2024-01-04T00:30:00Z', '2024-01-04T02:00:00Z'),
      session(2, '2024-01-04T10:00:00Z', '2024-01-04T11:00:00Z'),
    ]);

    expect(Object.fromEntries(machineMinutesByDate)).toEqual({ '2024-01-03': 180, '2024-01-04': 60 });
    expect(Object.fromEntries(machineMinutesByResource)).toEqual({ 1: 180, 2: 60 });
    expect(totalMachineMinutes).toBe(240);
  });
});
