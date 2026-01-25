import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BillingTransaction, BillingTransactionStatus, ResourceUsage, Setting } from '@attraccess/database-entities';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageHistoryResponseDto } from './dto/project-usage-history-response.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import { ProjectAccessService } from './project-access.service';
import { Currency } from '../billing/dto/set-configuration.dto';

type UsageSummaryRaw = {
  totalSessions: string | null;
  totalMinutes: string | null;
};

type SpendRaw = {
  totalSpend: string | null;
};

type TimeSeriesUsageRaw = {
  usageDate: string;
  sessions: string;
  minutes: string;
};

type TimeSeriesSpendRaw = {
  usageDate: string;
  spend: string;
};

type ResourceUsageAggregateRaw = {
  resourceId: string;
  resourceName: string | null;
  sessions: string;
  minutes: string;
};

type ResourceSpendAggregateRaw = {
  resourceId: string;
  spend: string;
};

@Injectable()
export class ProjectUsageService {
  constructor(
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction)
    private readonly billingTransactionRepository: Repository<BillingTransaction>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  private applyDateFilters<T>(qb: SelectQueryBuilder<T>, alias: string, startDate?: Date, endDate?: Date): void {
    if (startDate) {
      qb.andWhere(`${alias}.startTime >= :startDate`, { startDate });
    }
    if (endDate) {
      qb.andWhere(`${alias}.startTime <= :endDate`, { endDate });
    }
  }

  async getProjectUsageHistory(
    userId: number,
    projectId: number,
    query: GetProjectUsageHistoryQueryDto,
  ): Promise<ProjectUsageHistoryResponseDto> {
    await this.projectAccessService.getAccessOrThrow(userId, projectId);

    const qb = this.resourceUsageRepository
      .createQueryBuilder('usage')
      .leftJoinAndSelect('usage.user', 'user')
      .leftJoinAndSelect('usage.resource', 'resource')
      .leftJoinAndSelect('usage.project', 'project')
      .where('usage.projectId = :projectId', { projectId })
      .orderBy('usage.startTime', 'DESC');

    this.applyDateFilters(qb, 'usage', query.startDate, query.endDate);

    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const nextPage = query.page * query.limit < total ? query.page + 1 : undefined;

    return {
      data,
      total,
      page: query.page,
      limit: query.limit,
      nextPage,
    };
  }

  async getProjectUsageStats(
    userId: number,
    projectId: number,
    query: ProjectUsageStatsQueryDto,
  ): Promise<ProjectUsageStatsDto> {
    await this.projectAccessService.getAccessOrThrow(userId, projectId);

    const configuration = await this.getBillingConfiguration();

    const completedUsageQb = this.resourceUsageRepository
      .createQueryBuilder('usage')
      .leftJoin('usage.resource', 'resource')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('usage.endTime IS NOT NULL');

    this.applyDateFilters(completedUsageQb, 'usage', query.startDate, query.endDate);

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

    const billingBaseQb = this.billingTransactionRepository
      .createQueryBuilder('tx')
      .innerJoin('tx.resourceUsage', 'usage')
      .where('usage.projectId = :projectId', { projectId })
      .andWhere('tx.status = :status', { status: BillingTransactionStatus.Completed });

    this.applyDateFilters(billingBaseQb, 'usage', query.startDate, query.endDate);

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

  private async getBillingConfiguration(): Promise<{ currency: Currency; minorUnit: number }> {
    const currencySetting = await this.settingRepository.findOneBy({
      parent: 'billing',
      key: 'currency',
    });
    const currencyValue = (currencySetting?.value as Currency) ?? Currency.EUR;

    let minorUnit: number;
    switch (currencyValue) {
      case Currency.EUR:
        minorUnit = 2;
        break;
      default: {
        const exhaustiveCheck: never = currencyValue;
        throw new Error(`Unsupported currency: ${exhaustiveCheck}`);
      }
    }

    return { currency: currencyValue, minorUnit };
  }
}
