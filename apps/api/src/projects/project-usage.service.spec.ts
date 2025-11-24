import { Test } from '@nestjs/testing';
import { ProjectUsageService } from './project-usage.service';
import { Repository } from 'typeorm';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BillingService } from '../billing/billing.service';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectAccessService } from './project-access.service';

type MockedQueryBuilder = {
  innerJoin: jest.Mock;
  leftJoinAndSelect: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  groupBy: jest.Mock;
  addGroupBy: jest.Mock;
  limit: jest.Mock;
  getManyAndCount: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
  clone: jest.Mock;
};

type RawResult = Record<string, unknown>;

type MockQueryBuilderOptions<T> = {
  manyAndCount?: [T[], number];
  rawOnes?: RawResult[];
  rawMany?: RawResult[][];
};

const createMockQueryBuilder = <T>(options: MockQueryBuilderOptions<T>): MockedQueryBuilder => {
  const rawOnes: RawResult[] = options.rawOnes ? [...options.rawOnes] : [];
  const rawMany: RawResult[][] = options.rawMany ? [...options.rawMany] : [];

  const builder: Partial<MockedQueryBuilder> = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue(options.manyAndCount ?? [[], 0]),
    getRawOne: jest.fn().mockImplementation(() => Promise.resolve(rawOnes.shift() ?? null)),
    getRawMany: jest.fn().mockImplementation(() => Promise.resolve(rawMany.shift() ?? [])),
  };

  builder.clone = jest.fn().mockReturnValue(builder);

  return builder as MockedQueryBuilder;
};

describe('ProjectUsageService', () => {
  let service: ProjectUsageService;
  let resourceUsageRepository: Repository<ResourceUsage>;
  let billingTransactionRepository: Repository<BillingTransaction>;
  const billingService = {
    getConfiguration: jest.fn(),
  };
  const projectAccessService = {
    getAccessOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectUsageService,
        { provide: BillingService, useValue: billingService },
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(BillingTransaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ProjectAccessService,
          useValue: projectAccessService,
        },
      ],
    }).compile();

    service = moduleRef.get(ProjectUsageService);
    resourceUsageRepository = moduleRef.get(getRepositoryToken(ResourceUsage));
    billingTransactionRepository = moduleRef.get(getRepositoryToken(BillingTransaction));

    jest.resetAllMocks();
  });

  describe('getProjectUsageHistory', () => {
    it('returns paginated history with nextPage when more results exist', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      const qb = createMockQueryBuilder<ResourceUsage>({
        manyAndCount: [[{ id: 1 } as ResourceUsage], 3],
      });
      jest.spyOn(resourceUsageRepository, 'createQueryBuilder').mockReturnValue(qb as never);

      const result = await service.getProjectUsageHistory(1, 5, {
        page: 1,
        limit: 1,
      } as GetProjectUsageHistoryQueryDto);

      expect(resourceUsageRepository.createQueryBuilder).toHaveBeenCalledWith('usage');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.nextPage).toBe(2);
    });
  });

  describe('getProjectUsageStats', () => {
    it('aggregates summary, time series, and top resources', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      const usageQb = createMockQueryBuilder<ResourceUsage>({
        rawOnes: [{ totalSessions: '2', totalMinutes: '45' }],
        rawMany: [
          [
            { resourceId: '1', resourceName: 'Laser Cutter', sessions: '2', minutes: '30' },
            { resourceId: '2', resourceName: 'CNC', sessions: '1', minutes: '15' },
          ],
          [
            { usageDate: '2024-01-01', sessions: '1', minutes: '15' },
            { usageDate: '2024-01-02', sessions: '1', minutes: '30' },
          ],
        ],
      });

      const billingQb = createMockQueryBuilder<BillingTransaction>({
        rawOnes: [{ totalSpend: '300' }],
        rawMany: [
          [
            { resourceId: '1', spend: '200' },
            { resourceId: '2', spend: '100' },
          ],
          [
            { usageDate: '2024-01-01', spend: '120' },
            { usageDate: '2024-01-02', spend: '180' },
          ],
        ],
      });

      jest.spyOn(resourceUsageRepository, 'createQueryBuilder').mockReturnValue(usageQb as never);
      jest.spyOn(billingTransactionRepository, 'createQueryBuilder').mockReturnValue(billingQb as never);
      billingService.getConfiguration.mockResolvedValue({ currency: 'EUR', minorUnit: 2 });

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
