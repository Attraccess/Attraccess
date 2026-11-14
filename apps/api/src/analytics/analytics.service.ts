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
import { Between, Brackets, FindManyOptions, In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { ResourceHoursSummaryRowDto } from './dtos/resourceHoursSummary.dto';
import { MAX_REPORT_DURATION_MS, MAX_RESOURCE_IDS_PER_REPORT } from './dtos/resourceOperatingDurations.dto';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from '../resources/operating-intervals/resource-operating-attribution.service';

type ResourceHoursRangeParams = { start: Date; asOf: Date; action: ResourceUsageAction; pending: boolean };
type ResourceHours = Pick<
  ResourceHoursSummaryRowDto,
  | 'personDurationMs'
  | 'sessionDurationMs'
  | 'operatingDataAvailable'
  | 'operatingDurationMs'
  | 'unattributedOperatingDurationMs'
>;

const NO_HOURS: ResourceHours = {
  personDurationMs: 0,
  sessionDurationMs: 0,
  operatingDataAvailable: false,
  operatingDurationMs: null,
  unattributedOperatingDurationMs: null,
};

@Injectable()
export class AnalyticsService {
  public constructor(
    @InjectRepository(ResourceUsage)
    private resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction)
    private billingTransactionRepository: Repository<BillingTransaction>,
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
    if (asOf <= dateRange.start) {
      return [[], 0] as const;
    }

    const params = { start: dateRange.start, asOf, action: ResourceUsageAction.Usage, pending: false };
    const [resources, total] = await this.findResourcesActiveInRange(params, page, limit);
    const resourceIds = resources.map(({ id }) => id);
    if (resourceIds.length === 0) {
      return [[], total] as const;
    }

    const sessionsByResourceId = await this.countSessionsInRange(resourceIds, params);
    const hoursByResourceId = await this.sumHoursInRange(resourceIds, dateRange.start, asOf);
    // a range that has not ended yet can still gain sessions, even if none is open right now
    const isProvisional = dateRange.end.getTime() >= now.getTime();

    const rows = resources.map((resource): ResourceHoursSummaryRowDto => ({
      resourceId: resource.id,
      resourceName: resource.name,
      metadata: resource.metadata ?? null,
      sessionCount: sessionsByResourceId.get(resource.id) ?? 0,
      ...(hoursByResourceId.get(resource.id) ?? NO_HOURS),
      isProvisional,
    }));
    return [rows, total] as const;
  }

  private findResourcesActiveInRange(params: ResourceHoursRangeParams, page: number, limit: number) {
    // deleted resources keep their history, so a past range reports the same hours after a deletion
    const query = this.resourceRepository
      .createQueryBuilder('resource')
      .withDeleted()
      .select(['resource.id', 'resource.name', 'resource.metadata']);
    const sources = [
      {
        entity: ResourceUsage,
        alias: 'usage',
        condition: 'usage.usageAction = :action AND usage.lifecyclePending = :pending AND usage.startTime < :asOf',
      },
      { entity: ResourceOperatingInterval, alias: 'interval', condition: 'interval.startTime < :asOf' },
    ];
    // Open and closed records are checked apart so SQLite can search the (resourceId, endTime) indexes.
    const exists = sources.flatMap(({ entity, alias, condition }) =>
      [`${alias}.endTime IS NULL`, `${alias}.endTime > :start`].map(
        (end) =>
          `EXISTS ${query
            .subQuery()
            .select('1')
            .from(entity, alias)
            .where(`${alias}.resourceId = resource.id AND ${condition} AND ${end}`)
            .getQuery()}`,
      ),
    );

    return query
      .where(new Brackets((qb) => exists.forEach((condition) => qb.orWhere(condition))))
      .setParameters(params)
      .orderBy('resource.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  private async countSessionsInRange(resourceIds: number[], params: ResourceHoursRangeParams) {
    const sessionCounts = await this.resourceUsageRepository
      .createQueryBuilder('usage')
      .select('usage.resourceId', 'resourceId')
      .addSelect('COUNT(*)', 'sessions')
      .where('usage.resourceId IN (:...resourceIds)', { resourceIds })
      .andWhere('usage.usageAction = :action AND usage.lifecyclePending = :pending', params)
      .andWhere('usage.startTime < :asOf AND (usage.endTime IS NULL OR usage.endTime > :start)', params)
      .groupBy('usage.resourceId')
      .getRawMany<{ resourceId: number; sessions: string }>();
    return new Map(sessionCounts.map((row) => [Number(row.resourceId), Number(row.sessions)]));
  }

  /**
   * Derives the hours with the same bounds per call as the operating durations report (100 resources, 31 days), so
   * memory stays bounded for long ranges. Durations clipped to disjoint windows add up to the clipped total.
   */
  private async sumHoursInRange(resourceIds: number[], start: Date, asOf: Date) {
    const hoursByResourceId = new Map<number, ResourceHours>();
    for (let offset = 0; offset < resourceIds.length; offset += MAX_RESOURCE_IDS_PER_REPORT) {
      const batch = resourceIds.slice(offset, offset + MAX_RESOURCE_IDS_PER_REPORT);
      const firstActivity = await this.firstActivityInRange(batch, start, asOf);
      for (
        let windowStart = firstActivity.getTime();
        windowStart < asOf.getTime();
        windowStart += MAX_REPORT_DURATION_MS
      ) {
        const windowEnd = new Date(Math.min(windowStart + MAX_REPORT_DURATION_MS, asOf.getTime()));
        // isProvisional is decided for the whole range by the caller
        const summaries = await this.operatingAttributionService.getForResources(
          batch,
          new Date(windowStart),
          windowEnd,
          false,
        );
        summaries.forEach((summary, resourceId) =>
          hoursByResourceId.set(resourceId, addHours(hoursByResourceId.get(resourceId) ?? NO_HOURS, summary)),
        );
      }
    }
    return hoursByResourceId;
  }

  /** Where the batch's first session or interval overlapping the range starts: the windows before it are empty. */
  private async firstActivityInRange(resourceIds: number[], start: Date, asOf: Date): Promise<Date> {
    const overlapping = { resourceId: In(resourceIds), startTime: LessThan(asOf) };
    const usage = { ...overlapping, usageAction: ResourceUsageAction.Usage, lifecyclePending: false };
    const [firstUsage, firstInterval] = await Promise.all([
      this.resourceUsageRepository.findOne({
        where: [
          { ...usage, endTime: IsNull() },
          { ...usage, endTime: MoreThan(start) },
        ],
        order: { startTime: 'ASC' },
        select: ['id', 'startTime'],
      }),
      this.resourceRepository.manager.getRepository(ResourceOperatingInterval).findOne({
        where: [
          { ...overlapping, endTime: IsNull() },
          { ...overlapping, endTime: MoreThan(start) },
        ],
        order: { startTime: 'ASC' },
        select: ['id', 'startTime'],
      }),
    ]);
    const firstStarts = [firstUsage, firstInterval].flatMap((record) => (record ? [record.startTime.getTime()] : []));
    return new Date(Math.max(start.getTime(), Math.min(asOf.getTime(), ...firstStarts)));
  }
}

function addHours(hours: ResourceHours, summary: ResourceOperatingAttributionSummary): ResourceHours {
  const add = (total: number | null, value: number | null) => (value === null ? null : (total ?? 0) + value);
  return {
    personDurationMs: hours.personDurationMs + summary.personDurationMs,
    sessionDurationMs: hours.sessionDurationMs + summary.sessionDurationMs,
    operatingDataAvailable: summary.operatingDataAvailable,
    operatingDurationMs: add(hours.operatingDurationMs, summary.operatingDurationMs),
    unattributedOperatingDurationMs: add(
      hours.unattributedOperatingDurationMs,
      summary.unattributedOperatingDurationMs,
    ),
  };
}
