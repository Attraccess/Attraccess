import { Between } from 'typeorm';
import { ResourceUsageAction } from '@attraccess/application-models';
import { TypeOrmAnalyticsReader } from './typeorm-analytics-reader';
import { DateRangeValue } from '../../../analytics/dtos/dateRangeValue';

describe('TypeOrmAnalyticsReader export queries', () => {
  const usages = { findAndCount: jest.fn() };
  const transactions = { findAndCount: jest.fn() };
  const reader = new TypeOrmAnalyticsReader(usages as never, transactions as never, {} as never);

  afterEach(() => jest.clearAllMocks());

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

      usages.findAndCount.mockResolvedValue([expectedResourceUsage, 1]);

      const result = await reader.findUsagesStartedInRange(dateRange, 1, 500);

      expect(usages.findAndCount).toHaveBeenCalledWith({
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

      expect(result).toEqual({
        rows: [{ ...expectedResourceUsage[0], userEmail: null, supervisorEmail: null }],
        total: 1,
      });
    });

    it('should apply skip/take for page 2', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-01-01'),
        end: new Date('2023-01-31'),
      };

      usages.findAndCount.mockResolvedValue([[], 1000]);

      await reader.findUsagesStartedInRange(dateRange, 2, 100);

      expect(usages.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 100, take: 100 }));
    });

    it('should return an empty array when no records are found', async () => {
      const dateRange: DateRangeValue = {
        start: new Date('2023-02-01'),
        end: new Date('2023-02-28'),
      };

      usages.findAndCount.mockResolvedValue([[], 0]);

      const result = await reader.findUsagesStartedInRange(dateRange, 1, 500);

      expect(result).toEqual({ rows: [], total: 0 });
    });
  });

  describe('export email and metadata fields', () => {
    const dateRange: DateRangeValue = { start: new Date('2023-01-01'), end: new Date('2023-01-31') };

    it('adds flat email fields to resource usage rows and keeps resource metadata', async () => {
      usages.findAndCount.mockResolvedValue([
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

      const { rows } = await reader.findUsagesStartedInRange(dateRange, 1, 500);

      expect(rows[0]).toMatchObject({
        userEmail: 'user@example.com',
        supervisorEmail: 'mentor@example.com',
        user: { externalIdentifier: 'EXT-1' },
        resource: { metadata: { costCenter: '4711' } },
      });
    });

    it('uses null emails when users are absent', async () => {
      usages.findAndCount.mockResolvedValue([[{ id: 1, user: null, supervisorUser: null }], 1]);

      const { rows } = await reader.findUsagesStartedInRange(dateRange, 1, 500);

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
      transactions.findAndCount.mockResolvedValue([[transaction], 1]);

      const { rows, total } = await reader.findBillingTransactionsInRange(dateRange, 2, 50, true);

      expect(transactions.findAndCount).toHaveBeenCalledWith({
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
      transactions.findAndCount.mockResolvedValue([[{ id: 6, user: null, initiator: null }], 1]);

      const { rows } = await reader.findBillingTransactionsInRange(dateRange, 1, 500, true);

      expect(rows[0]).toMatchObject({ userEmail: null, initiatorEmail: null });
    });

    it('omits the emails unless the caller may see them', async () => {
      transactions.findAndCount.mockResolvedValue([[transaction], 1]);

      const { rows } = await reader.findBillingTransactionsInRange(dateRange, 1, 500, false);

      expect(rows[0]).toMatchObject({ userEmail: null, initiatorEmail: null });
    });
  });
});
