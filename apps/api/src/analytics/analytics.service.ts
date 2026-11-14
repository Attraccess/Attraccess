import { Injectable } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { toBillingTransactionExportRow, toResourceUsageExportRow } from './dtos/analyticsExportRows.dto';
import {
  BillingTransaction,
  Resource,
  ResourceOperatingInterval,
  ResourceUsage,
  ResourceUsageAction,
} from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindManyOptions, In, Repository } from 'typeorm';
import { ResourceHoursSummaryRowDto } from './dtos/resourceHoursSummary.dto';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from '../resources/operating-intervals/resource-operating-attribution.service';

const RESOURCES_PER_ATTRIBUTION_BATCH = 150;

@Injectable()
export class AnalyticsService {
  public constructor(
    @InjectRepository(ResourceUsage)
    private resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction)
    private billingTransactionRepository: Repository<BillingTransaction>,
    @InjectRepository(ResourceOperatingInterval)
    private resourceOperatingIntervalRepository: Repository<ResourceOperatingInterval>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {}

  public async getResourceUsageHoursInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    const findOptions: FindManyOptions<ResourceUsage> = {
      where: {
        startTime: Between(dateRange.start, dateRange.end),
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
      },
      order: {
        startTime: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: ['user', 'resource', 'supervisorUser'],
      skip: (page - 1) * limit,
      take: limit,
    };

    const [usages, total] = await this.resourceUsageRepository.findAndCount(findOptions);
    return [usages.map(toResourceUsageExportRow), total] as const;
  }

  public async getBillingTransactionsInDateRange(
    dateRange: DateRangeValue,
    page = 1,
    limit = 500,
    includeEmail = false,
  ) {
    const findOptions: FindManyOptions<BillingTransaction> = {
      where: {
        createdAt: Between(dateRange.start, dateRange.end),
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: ['user', 'initiator', 'resourceUsage', 'resourceUsage.resource', 'items'],
      skip: (page - 1) * limit,
      take: limit,
    };

    const [transactions, total] = await this.billingTransactionRepository.findAndCount(findOptions);
    return [
      transactions.map((transaction) => toBillingTransactionExportRow(transaction, includeEmail)),
      total,
    ] as const;
  }

  public async getResourceOperatingDurations(
    resourceIds: number[],
    dateRange: DateRangeValue,
  ): Promise<Record<number, ResourceOperatingAttributionSummary>> {
    const now = new Date();
    const asOf = new Date(Math.min(dateRange.end.getTime(), now.getTime()));
    const liveValuesMayChange = dateRange.end.getTime() >= now.getTime();

    return Object.fromEntries(
      await this.operatingAttributionService.getForResources(resourceIds, dateRange.start, asOf, liveValuesMayChange),
    );
  }

  /**
   * One row per resource with a usage session or an operating interval overlapping the range, ordered by resource
   * id and paginated over resources. Durations are clipped to [start, min(end, now)], like the operating durations.
   */
  public async getResourceHoursSummaryInDateRange(
    dateRange: DateRangeValue,
    page = 1,
    limit = 500,
  ): Promise<readonly [ResourceHoursSummaryRowDto[], number]> {
    const now = new Date();
    const asOf = new Date(Math.min(dateRange.end.getTime(), now.getTime()));
    const params = { start: dateRange.start, asOf, action: ResourceUsageAction.Usage, pending: false };

    const [usageResourceIds, intervalResourceIds] = await Promise.all([
      this.resourceUsageRepository
        .createQueryBuilder('usage')
        .select('DISTINCT usage.resourceId', 'resourceId')
        .where('usage.usageAction = :action AND usage.lifecyclePending = :pending', params)
        .andWhere('usage.startTime < :asOf AND (usage.endTime IS NULL OR usage.endTime > :start)', params)
        .getRawMany<{ resourceId: number }>(),
      this.resourceOperatingIntervalRepository
        .createQueryBuilder('interval')
        .select('DISTINCT interval.resourceId', 'resourceId')
        .where('interval.startTime < :asOf AND (interval.endTime IS NULL OR interval.endTime > :start)', params)
        .getRawMany<{ resourceId: number }>(),
    ]);
    const allResourceIds = [
      ...new Set([...usageResourceIds, ...intervalResourceIds].map(({ resourceId }) => Number(resourceId))),
    ].sort((a, b) => a - b);
    const resourceIds = allResourceIds.slice((page - 1) * limit, page * limit);
    if (resourceIds.length === 0) {
      return [[], allResourceIds.length] as const;
    }

    const [resources, sessionCounts] = await Promise.all([
      this.resourceRepository.find({ where: { id: In(resourceIds) }, select: ['id', 'name', 'metadata'] }),
      this.resourceUsageRepository
        .createQueryBuilder('usage')
        .select('usage.resourceId', 'resourceId')
        .addSelect('COUNT(*)', 'sessions')
        .where('usage.resourceId IN (:...resourceIds)', { resourceIds })
        .andWhere('usage.usageAction = :action AND usage.lifecyclePending = :pending', params)
        .andWhere('usage.startTime < :asOf AND (usage.endTime IS NULL OR usage.endTime > :start)', params)
        .groupBy('usage.resourceId')
        .getRawMany<{ resourceId: number; sessions: string }>(),
    ]);
    const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
    const sessionsByResourceId = new Map(sessionCounts.map((row) => [Number(row.resourceId), Number(row.sessions)]));

    const liveValuesMayChange = dateRange.end.getTime() >= now.getTime();
    const summaries = new Map<number, ResourceOperatingAttributionSummary>();
    for (let offset = 0; offset < resourceIds.length; offset += RESOURCES_PER_ATTRIBUTION_BATCH) {
      const batch = await this.operatingAttributionService.getForResources(
        resourceIds.slice(offset, offset + RESOURCES_PER_ATTRIBUTION_BATCH),
        dateRange.start,
        asOf,
        liveValuesMayChange,
      );
      batch.forEach((summary, resourceId) => summaries.set(resourceId, summary));
    }

    const rows = resourceIds.map((resourceId): ResourceHoursSummaryRowDto => {
      const resource = resourcesById.get(resourceId);
      const summary = summaries.get(resourceId);
      return {
        resourceId,
        resourceName: resource?.name ?? '',
        metadata: resource?.metadata ?? null,
        sessionCount: sessionsByResourceId.get(resourceId) ?? 0,
        personDurationMs: summary?.personDurationMs ?? 0,
        sessionDurationMs: summary?.sessionDurationMs ?? 0,
        operatingDataAvailable: summary?.operatingDataAvailable ?? false,
        operatingDurationMs: summary?.operatingDurationMs ?? null,
        unattributedOperatingDurationMs: summary?.unattributedOperatingDurationMs ?? null,
        // a range that has not ended yet can still gain sessions, even if none is open right now
        isProvisional: (summary?.isProvisional ?? false) || liveValuesMayChange,
      };
    });
    return [rows, allResourceIds.length] as const;
  }
}
