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

export interface MachineRun {
  resourceId: number;
  /** Start of the earliest session of the run; decides the day the run is attributed to. */
  startTime: Date;
  minutes: number;
}

/**
 * Merges the sessions of each resource whose time ranges strictly overlap into runs: time in which at least one of
 * the sessions kept the machine busy. Sessions that only touch (one ends exactly when the next starts) stay apart.
 */
export function mergeSessionsIntoRuns(
  sessions: Array<{ resourceId: number; startTime: Date; endTime: Date | null }>,
): MachineRun[] {
  const ordered = sessions
    .filter((session): session is { resourceId: number; startTime: Date; endTime: Date } => session.endTime !== null)
    .sort((a, b) => a.resourceId - b.resourceId || a.startTime.getTime() - b.startTime.getTime());

  const runs: MachineRun[] = [];
  let current: { resourceId: number; startTime: Date; endMs: number } | null = null;
  const flush = () => {
    if (current) {
      runs.push({
        resourceId: current.resourceId,
        startTime: current.startTime,
        minutes: (current.endMs - current.startTime.getTime()) / 60_000,
      });
    }
  };

  for (const { resourceId, startTime, endTime } of ordered) {
    if (current && current.resourceId === resourceId && startTime.getTime() < current.endMs) {
      current.endMs = Math.max(current.endMs, endTime.getTime());
    } else {
      flush();
      current = { resourceId, startTime, endMs: endTime.getTime() };
    }
  }
  flush();

  return runs;
}

/**
 * Adds up the machine minutes of the runs per resource, per day and in total. A run counts toward the UTC date of its
 * earliest session, the same day SQLite's DATE(startTime) gives that session, so the days add up to the total.
 */
export function sumMachineMinutes(sessions: Parameters<typeof mergeSessionsIntoRuns>[0]) {
  const machineMinutesByResource = new Map<number, number>();
  const machineMinutesByDate = new Map<string, number>();
  let totalMachineMinutes = 0;
  for (const run of mergeSessionsIntoRuns(sessions)) {
    const date = run.startTime.toISOString().slice(0, 10);
    machineMinutesByResource.set(run.resourceId, (machineMinutesByResource.get(run.resourceId) ?? 0) + run.minutes);
    machineMinutesByDate.set(date, (machineMinutesByDate.get(date) ?? 0) + run.minutes);
    totalMachineMinutes += run.minutes;
  }
  return { machineMinutesByResource, machineMinutesByDate, totalMachineMinutes };
}

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

  // Machine minutes are merged in memory: the union of time ranges has no portable SQL.
  const sessions = await completedUsageQb
    .clone()
    .select(['usage.id', 'usage.resourceId', 'usage.startTime', 'usage.endTime'])
    .getMany();
  const { machineMinutesByResource, machineMinutesByDate, totalMachineMinutes } = sumMachineMinutes(sessions);

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
    machineMinutes: machineMinutesByResource.get(Number(row.resourceId)) ?? 0,
    spend: spendByResource.get(Number(row.resourceId)) ?? 0,
  }));

  const timeSeries = timeSeriesUsageRaw.map((row) => ({
    date: row.usageDate,
    sessions: Number(row.sessions),
    minutes: Number(row.minutes),
    machineMinutes: machineMinutesByDate.get(row.usageDate) ?? 0,
    spend: timeSeriesSpendMap.get(row.usageDate) ?? 0,
  }));

  return {
    summary: {
      totalSessions: Number(summaryRaw?.totalSessions ?? 0),
      totalMinutes: Number(summaryRaw?.totalMinutes ?? 0),
      totalMachineMinutes,
      totalSpend: Number(totalSpendRaw?.totalSpend ?? 0),
      currency: configuration.currency,
      minorUnit: configuration.minorUnit,
    },
    timeSeries,
    topResources,
  };
}
