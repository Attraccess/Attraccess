import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dtos/analyticsQuery.dto';
import { ResourceOperatingDurationsDto } from './dtos/resourceOperatingDurations.dto';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockAnalyticsService = {
    getResourceUsageHoursInDateRange: jest.fn(),
    getBillingTransactionsInDateRange: jest.fn(),
    getResourceOperatingDurations: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        {
          provide: AnalyticsService,
          useValue: mockAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getResourceUsageHoursInDateRange', () => {
    const makeQuery = (overrides: Partial<AnalyticsQueryDto> = {}): AnalyticsQueryDto =>
      Object.assign(new AnalyticsQueryDto(), {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
        page: 1,
        limit: 500,
        ...overrides,
      });

    it('should return a paginated response', async () => {
      const query = makeQuery();
      const mockUsage = [{ id: 1, resourceId: 1, userId: 1 }];

      mockAnalyticsService.getResourceUsageHoursInDateRange.mockResolvedValue([mockUsage, 1]);

      const result = await controller.getResourceUsageHoursInDateRange(query);

      expect(service.getResourceUsageHoursInDateRange).toHaveBeenCalledWith(
        { start: query.start, end: query.end },
        1,
        500,
      );
      expect(result).toEqual({ data: mockUsage, total: 1, page: 1, limit: 500, nextPage: undefined });
    });

    it('should set nextPage when more pages exist', async () => {
      const query = makeQuery({ page: 1, limit: 10 });

      mockAnalyticsService.getResourceUsageHoursInDateRange.mockResolvedValue([[], 25]);

      const result = await controller.getResourceUsageHoursInDateRange(query);

      expect(result.nextPage).toBe(2);
    });

    it('should not set nextPage on the last page', async () => {
      const query = makeQuery({ page: 3, limit: 10 });

      mockAnalyticsService.getResourceUsageHoursInDateRange.mockResolvedValue([[], 25]);

      const result = await controller.getResourceUsageHoursInDateRange(query);

      expect(result.nextPage).toBeUndefined();
    });

    it('should handle service errors appropriately', async () => {
      const query = makeQuery({ start: new Date('2023-03-01'), end: new Date('2023-03-31') });
      const error = new Error('Database error');

      mockAnalyticsService.getResourceUsageHoursInDateRange.mockRejectedValue(error);

      await expect(controller.getResourceUsageHoursInDateRange(query)).rejects.toThrow(error);
    });
  });

  it('returns exact operating durations for the requested resources and date range', async () => {
    const body = Object.assign(new ResourceOperatingDurationsDto(), {
      resourceIds: [1, 2],
      start: new Date('2023-01-01T00:00:00Z'),
      end: new Date('2023-01-31T23:59:59Z'),
    });
    const report = { 1: { sessionDurationMs: 60_000 } };
    mockAnalyticsService.getResourceOperatingDurations.mockResolvedValue(report);

    await expect(controller.getResourceOperatingDurations(body)).resolves.toBe(report);
    expect(service.getResourceOperatingDurations).toHaveBeenCalledWith(body.resourceIds, {
      start: body.start,
      end: body.end,
    });
  });
});
