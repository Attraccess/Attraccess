import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BillingTransaction,
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
} from '@attraccess/database-entities';
import { Between, Repository } from 'typeorm';
import { DateRangeValue } from './dtos/dateRangeValue';
import { ResourceOperatingAttributionService } from '../resources/operating-intervals/resource-operating-attribution.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repository: jest.Mocked<Repository<ResourceUsage>>;

  const queryBuilder = () => {
    const qb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };
    return qb;
  };
  let usageQueries: ReturnType<typeof queryBuilder>[];
  let intervalQuery: ReturnType<typeof queryBuilder>;
  const mockRepository = {
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const mockIntervalRepository = { createQueryBuilder: jest.fn() };
  const mockResourceRepository = { find: jest.fn() };
  const mockBillingRepository = {
    findAndCount: jest.fn(),
  };
  const operatingAttributionService = {
    getForResources: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(ResourceUsage),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(BillingTransaction),
          useValue: mockBillingRepository,
        },
        { provide: getRepositoryToken(ResourceOperatingInterval), useValue: mockIntervalRepository },
        { provide: getRepositoryToken(Resource), useValue: mockResourceRepository },
        {
          provide: ResourceOperatingAttributionService,
          useValue: operatingAttributionService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    repository = module.get<Repository<ResourceUsage>>(getRepositoryToken(ResourceUsage)) as jest.Mocked<
      Repository<ResourceUsage>
    >;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getResourceUsageHoursInDateRange', () => {
    it('should return resource usage for a date range with default pagination', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
      };

      const expectedResourceUsage = [
        {
          id: 1,
          resourceId: 1,
          userId: 1,
          startTime: new Date('2023-01-15'),
          endTime: new Date('2023-01-15T02:00:00Z'),
          startNotes: 'Starting session',
          endNotes: 'Ending session',
          usageInMinutes: 120,
          user: { id: 1, name: 'User 1' },
          resource: { id: 1, name: 'Resource 1' },
        },
      ];

      mockRepository.findAndCount.mockResolvedValue([expectedResourceUsage, 1]);

      const result = await service.getResourceUsageHoursInDateRange(dateRange);

      expect(repository.findAndCount).toHaveBeenCalledWith({
        where: {
          startTime: Between(dateRange.start, dateRange.end),
          usageAction: ResourceUsageAction.Usage,
          lifecyclePending: false,
        },
        order: {
          id: 'DESC',
          userId: 'DESC',
          startTime: 'DESC',
        },
        relations: ['user', 'resource', 'supervisorUser'],
        skip: 0,
        take: 500,
      });

      expect(result).toEqual([[{ ...expectedResourceUsage[0], userEmail: null, supervisorEmail: null }], 1]);
    });

    it('should apply skip/take for page 2', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
      };

      mockRepository.findAndCount.mockResolvedValue([[], 1000]);

      await service.getResourceUsageHoursInDateRange(dateRange, 2, 100);

      expect(repository.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
    });

    it('should return an empty array when no records are found', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-02-01'),
        end: new Date('2023-02-28'),
      };

      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.getResourceUsageHoursInDateRange(dateRange);

      expect(result).toEqual([[], 0]);
    });
  });

  describe('getResourceOperatingDurations', () => {
    afterEach(() => jest.useRealTimers());

    it('delegates the selected resource IDs and range to the batched attribution service', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-01-01T00:00:00Z'),
        end: new Date('2023-01-31T23:59:59Z'),
      };
      const report = new Map([[1, { operatingDurationMs: 60_000 }]]);
      operatingAttributionService.getForResources.mockResolvedValue(report);

      await expect(service.getResourceOperatingDurations([1], dateRange)).resolves.toEqual({
        1: { operatingDurationMs: 60_000 },
      });
      expect(operatingAttributionService.getForResources).toHaveBeenCalledWith(
        [1],
        dateRange.start,
        dateRange.end,
        false,
      );
    });

    it('caps live reports at the current instant', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2023-01-15T10:00:00Z'));
      operatingAttributionService.getForResources.mockResolvedValue(new Map());
      const dateRange: DateRangeValue = {
        start: new Date('2023-01-15T00:00:00Z'),
        end: new Date('2023-01-15T23:59:59Z'),
      };

      await service.getResourceOperatingDurations([1], dateRange);

      expect(operatingAttributionService.getForResources).toHaveBeenCalledWith(
        [1],
        dateRange.start,
        new Date('2023-01-15T10:00:00Z'),
        true,
      );
    });
  });
  describe('export email and metadata fields', () => {
    const dateRange: DateRangeValue = { start: new Date('2023-01-01'), end: new Date('2023-01-31') };

    it('adds flat email fields to resource usage rows and keeps resource metadata', async () => {
      mockRepository.findAndCount.mockResolvedValue([
        [
          {
            id: 1,
            user: { id: 1, email: 'user@example.com', externalIdentifier: 'EXT-1' },
            supervisorUser: { id: 2, email: 'mentor@example.com' },
            resource: { id: 1, metadata: { costCenter: '4711' } },
          },
        ],
        1,
      ]);

      const [rows] = await service.getResourceUsageHoursInDateRange(dateRange);

      expect(rows[0]).toMatchObject({
        userEmail: 'user@example.com',
        supervisorEmail: 'mentor@example.com',
        user: { externalIdentifier: 'EXT-1' },
        resource: { metadata: { costCenter: '4711' } },
      });
    });

    it('uses null emails when users are absent', async () => {
      mockRepository.findAndCount.mockResolvedValue([[{ id: 1, user: null, supervisorUser: null }], 1]);

      const [rows] = await service.getResourceUsageHoursInDateRange(dateRange);

      expect(rows[0]).toMatchObject({ userEmail: null, supervisorEmail: null });
    });
  });

  describe('getBillingTransactionsInDateRange', () => {
    const dateRange: DateRangeValue = { start: new Date('2023-01-01'), end: new Date('2023-01-31') };
    const transaction = {
      id: 5,
      user: { id: 1, email: 'user@example.com' },
      initiator: { id: 3, email: 'initiator@example.com' },
      resourceUsage: { id: 1, resource: { id: 1, metadata: { costCenter: '4711' } } },
      items: [],
    };

    it('loads the user, initiator, resource and item relations and maps the emails', async () => {
      mockBillingRepository.findAndCount.mockResolvedValue([[transaction], 1]);

      const [rows, total] = await service.getBillingTransactionsInDateRange(dateRange, 2, 50, true);

      expect(mockBillingRepository.findAndCount).toHaveBeenCalledWith({
        where: { createdAt: Between(dateRange.start, dateRange.end) },
        order: { createdAt: 'DESC', id: 'DESC', userId: 'DESC' },
        relations: ['user', 'initiator', 'resourceUsage', 'resourceUsage.resource', 'items'],
        skip: 50,
        take: 50,
      });
      expect(total).toBe(1);
      expect(rows[0]).toMatchObject({
        userEmail: 'user@example.com',
        initiatorEmail: 'initiator@example.com',
        resourceUsage: { resource: { metadata: { costCenter: '4711' } } },
      });
    });

    it('uses null emails when users are absent', async () => {
      mockBillingRepository.findAndCount.mockResolvedValue([[{ id: 6, user: null, initiator: null }], 1]);

      const [rows] = await service.getBillingTransactionsInDateRange(dateRange, 1, 500, true);

      expect(rows[0]).toMatchObject({ userEmail: null, initiatorEmail: null });
    });

    it('omits the emails unless the caller may see them', async () => {
      mockBillingRepository.findAndCount.mockResolvedValue([[transaction], 1]);

      const [rows] = await service.getBillingTransactionsInDateRange(dateRange);

      expect(rows[0]).toMatchObject({ userEmail: null, initiatorEmail: null });
    });
  });

  describe('getResourceHoursSummaryInDateRange', () => {
    const NOW = new Date('2024-02-01T00:00:00Z');
    const HOUR = 3_600_000;
    const dateRange: DateRangeValue = { start: new Date('2024-01-01'), end: new Date('2024-01-31') };
    const attribution = (overrides: Record<string, unknown>) => ({
      personDurationMs: 0,
      sessionDurationMs: 0,
      operatingDataAvailable: false,
      operatingDurationMs: null,
      unattributedOperatingDurationMs: null,
      isProvisional: false,
      ...overrides,
    });

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(NOW);
      usageQueries = [queryBuilder(), queryBuilder()];
      intervalQuery = queryBuilder();
      mockRepository.createQueryBuilder.mockReset();
      mockRepository.createQueryBuilder.mockReturnValueOnce(usageQueries[0]).mockReturnValueOnce(usageQueries[1]);
      mockIntervalRepository.createQueryBuilder.mockReturnValue(intervalQuery);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('lists resources with a session or an operating interval once, with person and machine durations', async () => {
      usageQueries[0].getRawMany.mockResolvedValue([{ resourceId: 2 }, { resourceId: 1 }]);
      intervalQuery.getRawMany.mockResolvedValue([{ resourceId: 3 }, { resourceId: 2 }]);
      usageQueries[1].getRawMany.mockResolvedValue([
        { resourceId: 1, sessions: '2' },
        { resourceId: 2, sessions: '1' },
      ]);
      mockResourceRepository.find.mockResolvedValue([
        { id: 1, name: 'Laser', metadata: { costCenter: '4711' } },
        { id: 2, name: 'CNC', metadata: null },
        { id: 3, name: 'Printer', metadata: null },
      ]);
      operatingAttributionService.getForResources.mockResolvedValue(
        new Map([
          [1, attribution({ personDurationMs: 4 * HOUR, sessionDurationMs: 3 * HOUR })],
          [
            2,
            attribution({
              operatingDataAvailable: true,
              operatingDurationMs: HOUR,
              unattributedOperatingDurationMs: HOUR,
            }),
          ],
          [
            3,
            attribution({ operatingDataAvailable: true, operatingDurationMs: 0, unattributedOperatingDurationMs: 0 }),
          ],
        ]),
      );

      const [rows, total] = await service.getResourceHoursSummaryInDateRange(dateRange);

      expect(total).toBe(3);
      expect(rows.map((row) => row.resourceId)).toEqual([1, 2, 3]);
      expect(rows[0]).toEqual({
        resourceId: 1,
        resourceName: 'Laser',
        metadata: { costCenter: '4711' },
        sessionCount: 2,
        personDurationMs: 4 * HOUR,
        sessionDurationMs: 3 * HOUR,
        operatingDataAvailable: false,
        operatingDurationMs: null,
        unattributedOperatingDurationMs: null,
        isProvisional: false,
      });
      expect(rows[1]).toMatchObject({ sessionCount: 1, operatingDataAvailable: true, operatingDurationMs: HOUR });
      expect(rows[2].sessionCount).toBe(0);
      // clipped to the range, and as of the range end because it lies in the past
      expect(operatingAttributionService.getForResources).toHaveBeenCalledWith(
        [1, 2, 3],
        dateRange.start,
        dateRange.end,
        false,
      );
    });

    it('marks a range that ends in the future provisional and clips to now', async () => {
      const future = { start: new Date('2024-01-01'), end: new Date('2024-03-01') };
      usageQueries[0].getRawMany.mockResolvedValue([{ resourceId: 1 }]);
      intervalQuery.getRawMany.mockResolvedValue([]);
      usageQueries[1].getRawMany.mockResolvedValue([{ resourceId: 1, sessions: '1' }]);
      mockResourceRepository.find.mockResolvedValue([{ id: 1, name: 'Laser', metadata: null }]);
      operatingAttributionService.getForResources.mockResolvedValue(new Map([[1, attribution({})]]));

      const [rows] = await service.getResourceHoursSummaryInDateRange(future);

      expect(rows[0].isProvisional).toBe(true);
      expect(operatingAttributionService.getForResources).toHaveBeenCalledWith([1], future.start, NOW, true);
    });

    it('paginates over resources and skips the lookups for an empty page', async () => {
      usageQueries[0].getRawMany.mockResolvedValue([{ resourceId: 1 }, { resourceId: 2 }, { resourceId: 3 }]);
      intervalQuery.getRawMany.mockResolvedValue([]);

      const [rows, total] = await service.getResourceHoursSummaryInDateRange(dateRange, 2, 3);

      expect(rows).toEqual([]);
      expect(total).toBe(3);
      expect(mockResourceRepository.find).not.toHaveBeenCalled();
      expect(operatingAttributionService.getForResources).not.toHaveBeenCalled();
    });

    it('only counts usage sessions that are not pending', async () => {
      usageQueries[0].getRawMany.mockResolvedValue([]);
      intervalQuery.getRawMany.mockResolvedValue([]);

      await service.getResourceHoursSummaryInDateRange(dateRange);

      expect(usageQueries[0].where).toHaveBeenCalledWith(
        'usage.usageAction = :action AND usage.lifecyclePending = :pending',
        expect.objectContaining({ action: ResourceUsageAction.Usage, pending: false }),
      );
    });
  });
});
