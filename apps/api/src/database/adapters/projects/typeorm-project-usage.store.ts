import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { instanceToPlain } from 'class-transformer';
import {
  BillingTransactionStatus,
  type ProjectUsageAggregates,
  type ProjectUsageDateRange,
  type ProjectUsageHistoryEntry,
} from '@attraccess/application-models';
import { BillingTransaction, ResourceUsage, Setting } from '@attraccess/database-entities';
import { Repository, SelectQueryBuilder } from 'typeorm';
import type { ProjectUsageStore } from '../../../projects/project.port';

type SummaryRaw = { totalSessions: string | null; totalMinutes: string | null };
type SpendRaw = { totalSpend: string | null };
type TimeSeriesUsageRaw = { usageDate: string; sessions: string; minutes: string };
type TimeSeriesSpendRaw = { usageDate: string; spend: string };
type ResourceUsageAggregateRaw = { resourceId: string; resourceName: string | null; sessions: string; minutes: string };
type ResourceSpendAggregateRaw = { resourceId: string; spend: string };

/** The UTC calendar day of a session start as `YYYY-MM-DD` (independent of the database session's time zone). */
const START_DAY = "to_char(usage.startTime AT TIME ZONE 'UTC', 'YYYY-MM-DD')";

const SPEND_SUM = 'COALESCE(SUM(CASE WHEN tx.amount < 0 THEN -tx.amount ELSE 0 END), 0)';

@Injectable()
export class TypeOrmProjectUsageStore implements ProjectUsageStore {
  constructor(
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
    @InjectRepository(Setting) private readonly settings: Repository<Setting>,
  ) {}

  private applyDateFilters<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    range: ProjectUsageDateRange,
  ): void {
    if (range.startDate) qb.andWhere(`${alias}.startTime >= :startDate`, { startDate: range.startDate });
    if (range.endDate) qb.andWhere(`${alias}.startTime <= :endDate`, { endDate: range.endDate });
  }

  async listUsageHistory(
    projectId: number,
    range: ProjectUsageDateRange,
    paging: { page: number; limit: number },
  ): Promise<{ data: ProjectUsageHistoryEntry[]; total: number }> {
    const qb = this.usages
      .createQueryBuilder('usage')
      .leftJoinAndSelect('usage.user', 'user')
      .leftJoinAndSelect('usage.resource', 'resource')
      .leftJoinAndSelect('usage.project', 'project')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('usage.lifecyclePending = FALSE')
      .orderBy('usage.startTime', 'DESC');
    this.applyDateFilters(qb, 'usage', range);

    const [rows, total] = await qb
      .skip((paging.page - 1) * paging.limit)
      .take(paging.limit)
      .getManyAndCount();
    // The serialized entity applies the same @Exclude rules the HTTP layer applied to the entity before.
    return { data: rows.map((row) => instanceToPlain(row) as ProjectUsageHistoryEntry), total };
  }

  async readAggregates(projectId: number, range: ProjectUsageDateRange): Promise<ProjectUsageAggregates> {
    const completedUsageQb = this.usages
      .createQueryBuilder('usage')
      .leftJoin('usage.resource', 'resource')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('usage.endTime IS NOT NULL');
    this.applyDateFilters(completedUsageQb, 'usage', range);

    const summaryRaw = (await completedUsageQb
      .clone()
      .select('COUNT(*)', 'totalSessions')
      .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'totalMinutes')
      .getRawOne()) as SummaryRaw | undefined;

    const perResourceRaw = (await completedUsageQb
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

    const timeSeriesRaw = (await completedUsageQb
      .clone()
      .select(START_DAY, 'usageDate')
      .addSelect('COUNT(*)', 'sessions')
      .addSelect('COALESCE(SUM(usage.usageInMinutes), 0)', 'minutes')
      .groupBy(START_DAY)
      .orderBy(START_DAY, 'ASC')
      .getRawMany()) as TimeSeriesUsageRaw[];

    const sessions = await completedUsageQb
      .clone()
      .select(['usage.id', 'usage.resourceId', 'usage.startTime', 'usage.endTime'])
      .getMany();

    // A correction (a meter share billed after the session ended) counts toward the project of the session it corrects.
    const billingBaseQb = this.transactions
      .createQueryBuilder('tx')
      .leftJoin('tx.correctionOf', 'original')
      .innerJoin(ResourceUsage, 'usage', 'usage.id = COALESCE(tx.resourceUsageId, original.resourceUsageId)')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('tx.status = :status', { status: BillingTransactionStatus.Completed });
    this.applyDateFilters(billingBaseQb, 'usage', range);

    const totalSpendRaw = (await billingBaseQb.clone().select(SPEND_SUM, 'totalSpend').getRawOne()) as
      SpendRaw | undefined;
    const perResourceSpendRaw = (await billingBaseQb
      .clone()
      .select('usage.resourceId', 'resourceId')
      .addSelect(SPEND_SUM, 'spend')
      .groupBy('usage.resourceId')
      .getRawMany()) as ResourceSpendAggregateRaw[];
    const timeSeriesSpendRaw = (await billingBaseQb
      .clone()
      .select(START_DAY, 'usageDate')
      .addSelect(SPEND_SUM, 'spend')
      .groupBy(START_DAY)
      .orderBy(START_DAY, 'ASC')
      .getRawMany()) as TimeSeriesSpendRaw[];

    return {
      summary: {
        totalSessions: Number(summaryRaw?.totalSessions ?? 0),
        totalMinutes: Number(summaryRaw?.totalMinutes ?? 0),
      },
      perResource: perResourceRaw.map((row) => ({
        resourceId: Number(row.resourceId),
        resourceName: row.resourceName,
        sessions: Number(row.sessions),
        minutes: Number(row.minutes),
      })),
      timeSeries: timeSeriesRaw.map((row) => ({
        date: row.usageDate,
        sessions: Number(row.sessions),
        minutes: Number(row.minutes),
      })),
      sessions: sessions.map((session) => ({
        resourceId: session.resourceId,
        startTime: session.startTime,
        endTime: session.endTime,
      })),
      spend: {
        total: Number(totalSpendRaw?.totalSpend ?? 0),
        perResource: perResourceSpendRaw.map((row) => ({
          resourceId: Number(row.resourceId),
          spend: Number(row.spend),
        })),
        timeSeries: timeSeriesSpendRaw.map((row) => ({ date: row.usageDate, spend: Number(row.spend) })),
      },
    };
  }

  async readBillingCurrency(): Promise<string | null> {
    const setting = await this.settings.findOneBy({ parent: 'billing', key: 'currency' });
    return (setting?.value as string | undefined) ?? null;
  }
}
