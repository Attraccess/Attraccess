import { BillingTransaction, ResourceUsage, Setting } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Currency } from '../billing/dto/set-configuration.dto';
import { computeNextPage } from '../types/response';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageHistoryResponseDto } from './dto/project-usage-history-response.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import { ProjectAccessService } from './project-access.service';
import { getProjectUsageStats as getProjectUsageStatsImplementation } from './project-usage-statistics';

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
      .andWhere('usage.lifecyclePending = FALSE')
      .orderBy('usage.startTime', 'DESC');

    this.applyDateFilters(qb, 'usage', query.startDate, query.endDate);

    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    const nextPage = computeNextPage(query.page, query.limit, total);

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
    const getContextOwner = () => this;
    return getProjectUsageStatsImplementation(
      {
        projectAccessService: getContextOwner().projectAccessService,
        getBillingConfiguration: getContextOwner().getBillingConfiguration.bind(getContextOwner()),
        resourceUsageRepository: getContextOwner().resourceUsageRepository,
        applyDateFilters: getContextOwner().applyDateFilters.bind(getContextOwner()),
        billingTransactionRepository: getContextOwner().billingTransactionRepository,
      },
      userId,
      projectId,
      query,
    );
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

export {
  ResourceSpendAggregateRaw,
  ResourceUsageAggregateRaw,
  SpendRaw,
  TimeSeriesSpendRaw,
  TimeSeriesUsageRaw,
  UsageSummaryRaw,
} from './project-usage-statistics';
