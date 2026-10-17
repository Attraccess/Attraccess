import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import type { ProjectUsageService } from './project-usage.service';
export type {
  UsageSummaryRaw,
  SpendRaw,
  TimeSeriesUsageRaw,
  TimeSeriesSpendRaw,
  ResourceUsageAggregateRaw,
  ResourceSpendAggregateRaw,
} from './persistence/port';

interface ProjectUsageServiceProjectUsageStatisticsContext {
  projectAccessService: ProjectUsageService['projectAccessService'];
  getBillingConfiguration: ProjectUsageService['getBillingConfiguration'];
  persistence: ProjectUsageService['persistence'];
}
export async function getProjectUsageStats(
  context: ProjectUsageServiceProjectUsageStatisticsContext,
  userId: number,
  projectId: number,
  query: ProjectUsageStatsQueryDto,
): Promise<ProjectUsageStatsDto> {
  await context.projectAccessService.getAccessOrThrow(userId, projectId);

  const configuration = await context.getBillingConfiguration();

  const {
    summaryRaw,
    perResourceUsageRaw,
    timeSeriesUsageRaw,
    totalSpendRaw,
    perResourceSpendRaw,
    timeSeriesSpendRaw,
  } = await context.persistence.statistics(projectId, query);

  const spendByResource = new Map<number, number>();
  perResourceSpendRaw.forEach((row) => {
    spendByResource.set(Number(row.resourceId), Number(row.spend));
  });

  const timeSeriesSpendMap = new Map<string, number>();
  timeSeriesSpendRaw.forEach((row) => {
    timeSeriesSpendMap.set(row.usageDate, Number(row.spend));
  });

  const topResources = perResourceUsageRaw.map((row) => ({
    resourceId: Number(row.resourceId),
    resourceName: row.resourceName ?? 'Unknown resource',
    sessions: Number(row.sessions),
    minutes: Number(row.minutes),
    spend: spendByResource.get(Number(row.resourceId)) ?? 0,
  }));

  const timeSeries = timeSeriesUsageRaw.map((row) => ({
    date: row.usageDate,
    sessions: Number(row.sessions),
    minutes: Number(row.minutes),
    spend: timeSeriesSpendMap.get(row.usageDate) ?? 0,
  }));

  return {
    summary: {
      totalSessions: Number(summaryRaw?.totalSessions ?? 0),
      totalMinutes: Number(summaryRaw?.totalMinutes ?? 0),
      totalSpend: Number(totalSpendRaw?.totalSpend ?? 0),
      currency: configuration.currency,
      minorUnit: configuration.minorUnit,
    },
    timeSeries,
    topResources,
  };
}
