import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import type { ProjectUsageService } from './project-usage.service';
export type {
  UsageSummary,
  Spend,
  TimeSeriesUsage,
  TimeSeriesSpend,
  ResourceUsageAggregate,
  ResourceSpendAggregate,
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

  const { summary, perResourceUsage, timeSeriesUsage, totalSpend, perResourceSpend, timeSeriesSpend } =
    await context.persistence.statistics(projectId, query);

  const spendByResource = new Map<number, number>();
  perResourceSpend.forEach((row) => {
    spendByResource.set(row.resourceId, row.spend);
  });

  const timeSeriesSpendMap = new Map<string, number>();
  timeSeriesSpend.forEach((row) => {
    timeSeriesSpendMap.set(row.usageDate, row.spend);
  });

  const topResources = perResourceUsage.map((row) => ({
    resourceId: row.resourceId,
    resourceName: row.resourceName ?? 'Unknown resource',
    sessions: row.sessions,
    minutes: row.minutes,
    spend: spendByResource.get(row.resourceId) ?? 0,
  }));

  const timeSeries = timeSeriesUsage.map((row) => ({
    date: row.usageDate,
    sessions: row.sessions,
    minutes: row.minutes,
    spend: timeSeriesSpendMap.get(row.usageDate) ?? 0,
  }));

  return {
    summary: {
      totalSessions: summary.totalSessions,
      totalMinutes: summary.totalMinutes,
      totalSpend: totalSpend.totalSpend,
      currency: configuration.currency,
      minorUnit: configuration.minorUnit,
    },
    timeSeries,
    topResources,
  };
}
