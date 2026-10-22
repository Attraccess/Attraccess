import { TypeormProjectUsagePersistence } from './typeorm-adapter';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';
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

it('filters pending usage from project history and applies its selected page', async () => {
  const qb = createMockQueryBuilder<ResourceUsage>({ manyAndCount: [[{ id: 1 } as ResourceUsage], 3] });
  const adapter = new TypeormProjectUsagePersistence(
    { createQueryBuilder: () => qb } as never,
    {} as never,
    {} as never,
  );
  expect(await adapter.historyPage(5, 1, 1, {})).toEqual([[{ id: 1 }], 3]);
  expect(qb.andWhere).toHaveBeenCalledWith('usage.lifecyclePending = FALSE');
  expect(qb.skip).toHaveBeenCalledWith(0);
  expect(qb.take).toHaveBeenCalledWith(1);
});
it('normalizes populated driver aggregate strings into numeric application projections', async () => {
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

  const adapter = new TypeormProjectUsagePersistence(
    { createQueryBuilder: () => usageQb } as never,
    { createQueryBuilder: () => billingQb } as never,
    {} as never,
  );
  expect(await adapter.statistics(5, {})).toEqual({
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
});
