import { Test } from '@nestjs/testing';
import { ProjectUsageService } from './project-usage.service';
import { Repository } from 'typeorm';
import { BillingTransaction, ResourceUsage, Setting } from '@attraccess/database-entities';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { mergeSessionsIntoRuns } from './project-usage-statistics';
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
  getMany: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
  clone: jest.Mock;
};

type RawResult = Record<string, unknown>;

type MockQueryBuilderOptions<T> = {
  manyAndCount?: [T[], number];
  many?: T[];
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
    getMany: jest.fn().mockResolvedValue(options.many ?? []),
    getRawOne: jest.fn().mockImplementation(() => Promise.resolve(rawOnes.shift() ?? null)),
    getRawMany: jest.fn().mockImplementation(() => Promise.resolve(rawMany.shift() ?? [])),
  };

  builder.clone = jest.fn().mockReturnValue(builder);

  return builder as MockedQueryBuilder;
};

const usage = (id: number, resourceId: number, startTime: string, endTime: string) =>
  ({ id, resourceId, startTime: new Date(startTime), endTime: new Date(endTime) }) as ResourceUsage;

describe('ProjectUsageService', () => {
  let service: ProjectUsageService;
  let resourceUsageRepository: Repository<ResourceUsage>;
  let billingTransactionRepository: Repository<BillingTransaction>;
  let settingRepository: Repository<Setting>;
  const projectAccessService = {
    getAccessOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProjectUsageService,
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
          provide: getRepositoryToken(Setting),
          useValue: {
            findOneBy: jest.fn(),
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
    settingRepository = moduleRef.get(getRepositoryToken(Setting));

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
      expect(qb.andWhere).toHaveBeenCalledWith('usage.lifecyclePending = FALSE');
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(3);
      expect(result.nextPage).toBe(2);
    });
  });

  describe('getProjectUsageStats', () => {
    it('aggregates summary, time series, and top resources', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      const usageQb = createMockQueryBuilder<ResourceUsage>({
        many: [
          usage(1, 1, '2024-01-01T10:00:00Z', '2024-01-01T10:15:00Z'),
          usage(2, 1, '2024-01-02T10:00:00Z', '2024-01-02T10:30:00Z'),
          usage(3, 2, '2024-01-02T11:00:00Z', '2024-01-02T11:15:00Z'),
        ],
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
      jest.spyOn(settingRepository, 'findOneBy').mockResolvedValue({ value: 'EUR' } as Setting);

      const result = await service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto);

      expect(result.summary).toEqual({
        totalSessions: 2,
        totalMinutes: 45,
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
        minutes: 30,
        machineMinutes: 45,
        spend: 200,
      });
      expect(result.timeSeries).toEqual([
        { date: '2024-01-01', sessions: 1, minutes: 15, machineMinutes: 15, spend: 120 },
        { date: '2024-01-02', sessions: 1, minutes: 30, machineMinutes: 45, spend: 180 },
      ]);
    });

    it('counts overlapping sessions of a shared machine once as machine minutes', async () => {
      projectAccessService.getAccessOrThrow.mockResolvedValue(undefined);
      const usageQb = createMockQueryBuilder<ResourceUsage>({
        many: [
          usage(1, 1, '2024-01-01T10:00:00Z', '2024-01-01T12:00:00Z'),
          usage(2, 1, '2024-01-01T11:00:00Z', '2024-01-01T13:00:00Z'),
        ],
        rawOnes: [{ totalSessions: '2', totalMinutes: '240' }],
        rawMany: [
          [{ resourceId: '1', resourceName: 'Laser Cutter', sessions: '2', minutes: '240' }],
          [{ usageDate: '2024-01-01', sessions: '2', minutes: '240' }],
        ],
      });
      jest.spyOn(resourceUsageRepository, 'createQueryBuilder').mockReturnValue(usageQb as never);
      jest
        .spyOn(billingTransactionRepository, 'createQueryBuilder')
        .mockReturnValue(createMockQueryBuilder<BillingTransaction>({}) as never);
      jest.spyOn(settingRepository, 'findOneBy').mockResolvedValue({ value: 'EUR' } as Setting);

      const result = await service.getProjectUsageStats(1, 5, {} as ProjectUsageStatsQueryDto);

      expect(result.summary).toMatchObject({ totalMinutes: 240, totalMachineMinutes: 180 });
      expect(result.topResources[0]).toMatchObject({ minutes: 240, machineMinutes: 180 });
      expect(result.timeSeries[0]).toMatchObject({ minutes: 240, machineMinutes: 180 });
      expect(usageQb.select).toHaveBeenCalledWith(['usage.id', 'usage.resourceId', 'usage.startTime', 'usage.endTime']);
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
