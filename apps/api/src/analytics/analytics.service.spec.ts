import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BillingTransaction, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { Between, Repository } from 'typeorm';
import { DateRangeValue } from './dtos/dateRangeValue';
import { ResourceOperatingAttributionService } from '../resources/operating-intervals/resource-operating-attribution.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let repository: jest.Mocked<Repository<ResourceUsage>>;

  const mockRepository = {
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
          useValue: {},
        },
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

      expect(result).toEqual([expectedResourceUsage, 1]);
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
});
