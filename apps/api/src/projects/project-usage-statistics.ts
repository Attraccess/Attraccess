import type { ProjectUsageAggregates, ProjectUsageDateRange } from '@attraccess/application-models';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
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

export interface ProjectUsageStatisticsContext {
  getBillingConfiguration: () => Promise<{ currency: string; minorUnit: number }>;
  readAggregates: (range: ProjectUsageDateRange) => Promise<ProjectUsageAggregates>;
}

/** Combines the stored aggregates with the in-memory machine minutes into the statistics response. */
export async function getProjectUsageStats(
  context: ProjectUsageStatisticsContext,
  query: ProjectUsageStatsQueryDto,
): Promise<ProjectUsageStatsDto> {
  const configuration = await context.getBillingConfiguration();
  const aggregates = await context.readAggregates({ startDate: query.startDate, endDate: query.endDate });

  // Machine minutes are merged in memory: the union of time ranges has no portable SQL.
  const { machineMinutesByResource, machineMinutesByDate, totalMachineMinutes } = sumMachineMinutes(
    aggregates.sessions,
  );

  const spendByResource = new Map<number, number>();
  aggregates.spend.perResource.forEach((row) => {
    spendByResource.set(row.resourceId, row.spend);
  });

  const timeSeriesSpendMap = new Map<string, number>();
  aggregates.spend.timeSeries.forEach((row) => {
    timeSeriesSpendMap.set(row.date, row.spend);
  });

  const topResources = aggregates.perResource.map((row) => ({
    resourceId: row.resourceId,
    resourceName: row.resourceName ?? 'Unknown resource',
    sessions: row.sessions,
    minutes: row.minutes,
    machineMinutes: machineMinutesByResource.get(row.resourceId) ?? 0,
    spend: spendByResource.get(row.resourceId) ?? 0,
  }));

  const timeSeries = aggregates.timeSeries.map((row) => ({
    date: row.date,
    sessions: row.sessions,
    minutes: row.minutes,
    machineMinutes: machineMinutesByDate.get(row.date) ?? 0,
    spend: timeSeriesSpendMap.get(row.date) ?? 0,
  }));

  return {
    summary: {
      totalSessions: aggregates.summary.totalSessions,
      totalMinutes: aggregates.summary.totalMinutes,
      totalMachineMinutes,
      totalSpend: aggregates.spend.total,
      currency: configuration.currency,
      minorUnit: configuration.minorUnit,
    },
    timeSeries,
    topResources,
  };
}
