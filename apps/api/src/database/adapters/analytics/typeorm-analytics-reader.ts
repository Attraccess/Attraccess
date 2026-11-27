import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Brackets, In, IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import { BillingTransaction, Resource, ResourceOperatingInterval, ResourceUsage } from '@attraccess/database-entities';
import { ResourceUsageAction } from '@attraccess/application-models';
import {
  AnalyticsReader,
  BillingTransactionExportRow,
  ResourceHoursRangeParams,
  ResourceInRange,
  ResourceUsageExportRow,
} from '../../../analytics/analytics-reader.port';
import { DateRangeValue } from '../../../analytics/dtos/dateRangeValue';
import { toBillingTransactionExportRow, toResourceUsageExportRow } from './export-rows';

@Injectable()
export class TypeOrmAnalyticsReader implements AnalyticsReader {
  constructor(
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
    @InjectRepository(Resource) private readonly resources: Repository<Resource>,
  ) {}

  async findUsagesStartedInRange(
    range: DateRangeValue,
    page: number,
    limit: number,
  ): Promise<{ rows: ResourceUsageExportRow[]; total: number }> {
    const [usages, total] = await this.usages.findAndCount({
      where: {
        startTime: Between(range.start, range.end),
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
      },
      order: {
        startTime: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: { user: true, resource: true, supervisorUser: true },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { rows: usages.map(toResourceUsageExportRow), total };
  }

  async findBillingTransactionsInRange(
    range: DateRangeValue,
    page: number,
    limit: number,
    includeEmail: boolean,
  ): Promise<{ rows: BillingTransactionExportRow[]; total: number }> {
    const [transactions, total] = await this.transactions.findAndCount({
      where: {
        createdAt: Between(range.start, range.end),
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: { user: true, initiator: true, resourceUsage: { resource: true }, items: true },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { rows: transactions.map((transaction) => toBillingTransactionExportRow(transaction, includeEmail)), total };
  }

  async findResourcesActiveInRange(
    params: ResourceHoursRangeParams,
    page: number,
    limit: number,
  ): Promise<{ resources: ResourceInRange[]; total: number }> {
    // deleted resources keep their history, so a past range reports the same hours after a deletion
    const query = this.resources
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
    // Open and closed records are checked apart so each probe can use the (resourceId, endTime) indexes.
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

    const [rows, total] = await query
      .where(new Brackets((qb) => exists.forEach((condition) => qb.orWhere(condition))))
      .setParameters(params)
      .orderBy('resource.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return {
      resources: rows.map((resource) => ({
        id: resource.id,
        name: resource.name,
        metadata: resource.metadata ?? null,
      })),
      total,
    };
  }

  async countSessionsInRange(resourceIds: number[], params: ResourceHoursRangeParams): Promise<Map<number, number>> {
    const sessionCounts = await this.usages
      .createQueryBuilder('usage')
      .select('usage.resourceId', 'resourceId')
      .addSelect('COUNT(*)', 'sessions')
      .where('usage.resourceId IN (:...resourceIds)', { resourceIds })
      .andWhere('usage.usageAction = :action AND usage.lifecyclePending = :pending', params)
      .andWhere('usage.startTime < :asOf AND (usage.endTime IS NULL OR usage.endTime > :start)', params)
      // A session whose project was switched is one use: of its parts in the range, only the last counts.
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM "resource_usage" "next" WHERE "next"."previousUsageId" = "usage"."id" AND "next"."lifecyclePending" = false AND "next"."startTime" < :asOf)',
      )
      .groupBy('usage.resourceId')
      .getRawMany<{ resourceId: number; sessions: string }>();
    return new Map(sessionCounts.map((row) => [Number(row.resourceId), Number(row.sessions)]));
  }

  async findFirstActivityStart(resourceIds: number[], start: Date, asOf: Date): Promise<Date | null> {
    const overlapping = { resourceId: In(resourceIds), startTime: LessThan(asOf) };
    const usage = { ...overlapping, usageAction: ResourceUsageAction.Usage, lifecyclePending: false };
    const [firstUsage, firstInterval] = await Promise.all([
      this.usages.findOne({
        where: [
          { ...usage, endTime: IsNull() },
          { ...usage, endTime: MoreThan(start) },
        ],
        order: { startTime: 'ASC' },
        select: { id: true, startTime: true },
      }),
      this.resources.manager.getRepository(ResourceOperatingInterval).findOne({
        where: [
          { ...overlapping, endTime: IsNull() },
          { ...overlapping, endTime: MoreThan(start) },
        ],
        order: { startTime: 'ASC' },
        select: { id: true, startTime: true },
      }),
    ]);
    const starts = [firstUsage, firstInterval].flatMap((record) => (record ? [record.startTime.getTime()] : []));
    return starts.length === 0 ? null : new Date(Math.min(...starts));
  }
}
