import { getProjectUsageStats } from './project-usage-statistics';
import { ProjectUsageAggregates } from './persistence/port';
import { TypeormProjectUsagePersistence } from './persistence/typeorm-adapter';
import { SqliteBackend } from '../database/sqlite/backend';
import { BillingTransaction, ResourceUsage, Setting } from '@attraccess/database-entities';

it('returns normalized numbers from SQLite, including empty aggregate zeros', async () => {
  const source = await new SqliteBackend({ type: 'sqlite', database: ':memory:' }).createConnection().initialize();
  try {
    const persistence = new TypeormProjectUsagePersistence(
      source.getRepository(ResourceUsage),
      source.getRepository(BillingTransaction),
      source.getRepository(Setting),
    );
    const result = await persistence.statistics(1, {});
    expect(result).toEqual({
      summary: { totalSessions: 0, totalMinutes: 0 },
      totalSpend: { totalSpend: 0 },
      perResourceUsage: [],
      timeSeriesUsage: [],
      perResourceSpend: [],
      timeSeriesSpend: [],
    });
  } finally {
    await source.destroy();
  }
}, 30_000);

it('aggregates application projections through a port fake without interpreting database scalars', async () => {
  const aggregates: ProjectUsageAggregates = {
    summary: { totalSessions: 2, totalMinutes: 3.5 },
    totalSpend: { totalSpend: 42 },
    perResourceUsage: [{ resourceId: 7, resourceName: null, sessions: 2, minutes: 3.5 }],
    timeSeriesUsage: [{ usageDate: '2026-10-21', sessions: 2, minutes: 3.5 }],
    perResourceSpend: [{ resourceId: 7, spend: 42 }],
    timeSeriesSpend: [{ usageDate: '2026-10-21', spend: 42 }],
  };
  const statistics = jest.fn().mockResolvedValue(aggregates);
  const access = jest.fn();
  const result = await getProjectUsageStats(
    {
      projectAccessService: { getAccessOrThrow: access } as never,
      getBillingConfiguration: async () => ({ currency: 'EUR', minorUnit: 2 }) as never,
      persistence: { statistics } as never,
    },
    1,
    2,
    {},
  );
  expect(access).toHaveBeenCalledWith(1, 2);
  expect(statistics).toHaveBeenCalledWith(2, {});
  expect(result).toEqual({
    summary: { totalSessions: 2, totalMinutes: 3.5, totalSpend: 42, currency: 'EUR', minorUnit: 2 },
    topResources: [{ resourceId: 7, resourceName: 'Unknown resource', sessions: 2, minutes: 3.5, spend: 42 }],
    timeSeries: [{ date: '2026-10-21', sessions: 2, minutes: 3.5, spend: 42 }],
  });
});
