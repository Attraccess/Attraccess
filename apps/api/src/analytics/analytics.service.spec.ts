import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { ANALYTICS_READER } from './analytics-reader.port';
import { DateRangeValue } from './dtos/dateRangeValue';
import { ResourceOperatingAttributionService } from '../resources/operating-intervals/resource-operating-attribution.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const reader = {
    findUsagesStartedInRange: jest.fn(),
    findBillingTransactionsInRange: jest.fn(),
    findResourcesActiveInRange: jest.fn(),
    countSessionsInRange: jest.fn(),
    findFirstActivityStart: jest.fn(),
  };
  const operatingAttributionService = {
    getForResources: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: ANALYTICS_READER, useValue: reader },
        {
          provide: ResourceOperatingAttributionService,
          useValue: operatingAttributionService,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getResourceUsageHoursInDateRange', () => {
    const dateRange: DateRangeValue = { start: new Date('2023-01-01'), end: new Date('2023-01-31') };

    it('returns the rows and total of the reader with default pagination', async () => {
      reader.findUsagesStartedInRange.mockResolvedValue({ rows: [{ id: 1 }], total: 1 });

      await expect(service.getResourceUsageHoursInDateRange(dateRange)).resolves.toEqual([[{ id: 1 }], 1]);
      expect(reader.findUsagesStartedInRange).toHaveBeenCalledWith(dateRange, 1, 500);
    });

    it('passes the requested page and limit through', async () => {
      reader.findUsagesStartedInRange.mockResolvedValue({ rows: [], total: 1000 });

      await service.getResourceUsageHoursInDateRange(dateRange, 2, 100);

      expect(reader.findUsagesStartedInRange).toHaveBeenCalledWith(dateRange, 2, 100);
    });
  });

  describe('getBillingTransactionsInDateRange', () => {
    const dateRange: DateRangeValue = { start: new Date('2023-01-01'), end: new Date('2023-01-31') };

    it('omits emails unless the caller may see them', async () => {
      reader.findBillingTransactionsInRange.mockResolvedValue({ rows: [{ id: 5 }], total: 1 });

      await expect(service.getBillingTransactionsInDateRange(dateRange)).resolves.toEqual([[{ id: 5 }], 1]);
      expect(reader.findBillingTransactionsInRange).toHaveBeenCalledWith(dateRange, 1, 500, false);
    });

    it('asks for emails, page and limit when the caller may see them', async () => {
      reader.findBillingTransactionsInRange.mockResolvedValue({ rows: [], total: 0 });

      await service.getBillingTransactionsInDateRange(dateRange, 2, 50, true);

      expect(reader.findBillingTransactionsInRange).toHaveBeenCalledWith(dateRange, 2, 50, true);
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
