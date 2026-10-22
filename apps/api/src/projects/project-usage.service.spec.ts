import { ProjectUsagePersistence } from './persistence/port';
import { Test } from '@nestjs/testing';
import { ProjectUsageService } from './project-usage.service';
import { ResourceUsage } from '@attraccess/application-models';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectAccessService } from './project-access.service';

describe('ProjectUsageService', () => {
  let service: ProjectUsageService;
  let persistence: jest.Mocked<ProjectUsagePersistence>;
  const projectAccessService = {
    getAccessOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    persistence = { historyPage: jest.fn(), statistics: jest.fn(), billingCurrency: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectUsageService,
        { provide: ProjectUsagePersistence, useValue: persistence },
        {
          provide: ProjectAccessService,
          useValue: projectAccessService,
        },
      ],
    }).compile();

    service = moduleRef.get(ProjectUsageService);

    jest.resetAllMocks();
  });

  describe('getProjectUsageHistory', () => {
    it('returns paginated history with nextPage when more results exist', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      persistence.historyPage.mockResolvedValue([[{ id: 1 } as ResourceUsage], 3]);

      const result = await service.getProjectUsageHistory(1, 5, {
        page: 1,
        limit: 1,
      } as GetProjectUsageHistoryQueryDto);

      expect(persistence.historyPage).toHaveBeenCalledWith(5, 1, 1, { page: 1, limit: 1 });
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.nextPage).toBe(2);
    });
  });

  describe('getProjectUsageStats', () => {
    it('aggregates summary, time series, and top resources', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      persistence.statistics.mockResolvedValue({
        summary: { totalSessions: 2, totalMinutes: 45 },
        totalSpend: { totalSpend: 300 },
        perResourceUsage: [
          { resourceId: 1, resourceName: 'Laser Cutter', sessions: 2, minutes: 30 },
          { resourceId: 2, resourceName: 'CNC', sessions: 1, minutes: 15 },
        ],
        timeSeriesUsage: [
          { usageDate: '2024-01-01', sessions: 1, minutes: 15 },
          { usageDate: '2024-01-02', sessions: 1, minutes: 30 },
        ],
        perResourceSpend: [
          { resourceId: 1, spend: 200 },
          { resourceId: 2, spend: 100 },
        ],
        timeSeriesSpend: [
          { usageDate: '2024-01-01', spend: 120 },
          { usageDate: '2024-01-02', spend: 180 },
        ],
      });
      persistence.billingCurrency.mockResolvedValue('EUR');

      const result = await service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto);

      expect(result.summary).toEqual({
        totalSessions: 2,
        totalMinutes: 45,
        totalSpend: 300,
        currency: 'EUR',
        minorUnit: 2,
      });
      expect(result.topResources).toHaveLength(2);
      expect(result.topResources[0]).toEqual({
        resourceId: 1,
        resourceName: 'Laser Cutter',
        sessions: 2,
        minutes: 30,
        spend: 200,
      });
      expect(result.timeSeries).toEqual([
        { date: '2024-01-01', sessions: 1, minutes: 15, spend: 120 },
        { date: '2024-01-02', sessions: 1, minutes: 30, spend: 180 },
      ]);
    });
  });
});
