import { BillingTransactionStatus } from '@attraccess/database-entities';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import type { ProjectUsageService } from './project-usage.service';
export type UsageSummaryRaw = {
  totalSessions: string | null;
  totalMinutes: string | null;
};

export type SpendRaw = {
  totalSpend: string | null;
};

export type TimeSeriesUsageRaw = {
  usageDate: string;
  sessions: string;
  minutes: string;
};

export type TimeSeriesSpendRaw = {
  usageDate: string;
  spend: string;
};

export type ResourceUsageAggregateRaw = {
  resourceId: string;
  resourceName: string | null;
  sessions: string;
  minutes: string;
};

export type ResourceSpendAggregateRaw = {
  resourceId: string;
  spend: string;
};

interface ProjectUsageServiceProjectUsageStatisticsContext {
  projectAccessService: ProjectUsageService['projectAccessService'];
  getBillingConfiguration: ProjectUsageService['getBillingConfiguration'];
  resourceUsageRepository: ProjectUsageService['resourceUsageRepository'];
  applyDateFilters: ProjectUsageService['applyDateFilters'];
  billingTransactionRepository: ProjectUsageService['billingTransactionRepository'];
}
export async function getProjectUsageStats(
  context: ProjectUsageServiceProjectUsageStatisticsContext,
  userId: number,
  projectId: number,
  query: ProjectUsageStatsQueryDto,
): Promise<ProjectUsageStatsDto> {
  await context.projectAccessService.getAccessOrThrow(userId, projectId);

  const configuration = await context.getBillingConfiguration();

  const completedUsageQb = context.resourceUsageRepository
    .createQueryBuilder('usage')
    .leftJoin('usage.resource', 'resource')
    .where('usage.projectId = :projectId', { projectId })
    .andWhere('usage.endTime IS NOT NULL');

  context.applyDateFilters(completedUsageQb, 'usage', query.startDate, query.endDate);

  const summaryRaw = (await completedUsageQb
    .clone()
    .select('COUNT(*)', 'totalSessions')
    .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'totalMinutes')
    .getRawOne()) as UsageSummaryRaw;

  const perResourceUsageRaw = (await completedUsageQb
    .clone()
    .select('usage.resourceId', 'resourceId')
    .addSelect('resource.name', 'resourceName')
    .addSelect('COUNT(*)', 'sessions')
    .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'minutes')
    .groupBy('usage.resourceId')
    .addGroupBy('resource.name')
    .orderBy('sessions', 'DESC')
    .addOrderBy('minutes', 'DESC')
    .limit(5)
    .getRawMany()) as ResourceUsageAggregateRaw[];

  const timeSeriesUsageRaw = (await completedUsageQb
    .clone()
    .select('DATE(usage.startTime)', 'usageDate')
    .addSelect('COUNT(*)', 'sessions')
    .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'minutes')
    .groupBy('usageDate')
    .orderBy('usageDate', 'ASC')
    .getRawMany()) as TimeSeriesUsageRaw[];

  const billingBaseQb = context.billingTransactionRepository
    .createQueryBuilder('tx')
    .innerJoin('tx.resourceUsage', 'usage')
    .where('usage.projectId = :projectId', { projectId })
    .andWhere('tx.status = :status', { status: BillingTransactionStatus.Completed });

  context.applyDateFilters(billingBaseQb, 'usage', query.startDate, query.endDate);

  const totalSpendRaw = (await billingBaseQb
    .clone()
    .select('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'totalSpend')
    .getRawOne()) as SpendRaw;

  const perResourceSpendRaw = (await billingBaseQb
    .clone()
    .select('usage.resourceId', 'resourceId')
    .addSelect('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'spend')
    .groupBy('usage.resourceId')
    .getRawMany()) as ResourceSpendAggregateRaw[];

  const timeSeriesSpendRaw = (await billingBaseQb
    .clone()
    .select('DATE(usage.startTime)', 'usageDate')
    .addSelect('COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)', 'spend')
    .groupBy('usageDate')
    .orderBy('usageDate', 'ASC')
    .getRawMany()) as TimeSeriesSpendRaw[];

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
