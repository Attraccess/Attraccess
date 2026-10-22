import { Injectable } from '@nestjs/common';
import { ProjectUsagePersistence } from './persistence/port';
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
    private readonly persistence: ProjectUsagePersistence,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getProjectUsageHistory(
    userId: number,
    projectId: number,
    query: GetProjectUsageHistoryQueryDto,
  ): Promise<ProjectUsageHistoryResponseDto> {
    await this.projectAccessService.getAccessOrThrow(userId, projectId);

    const [data, total] = await this.persistence.historyPage(projectId, query.page, query.limit, query);

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
        persistence: getContextOwner().persistence,
      },
      userId,
      projectId,
      query,
    );
  }

  private async getBillingConfiguration(): Promise<{ currency: Currency; minorUnit: number }> {
    const currencyValue = ((await this.persistence.billingCurrency()) as Currency) ?? Currency.EUR;

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
  ResourceSpendAggregate,
  ResourceUsageAggregate,
  Spend,
  TimeSeriesSpend,
  TimeSeriesUsage,
  UsageSummary,
} from './project-usage-statistics';
