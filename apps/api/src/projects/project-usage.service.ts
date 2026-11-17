import { Inject, Injectable } from '@nestjs/common';
import { Currency } from '../billing/dto/set-configuration.dto';
import { computeNextPage } from '../types/response';
import { GetProjectUsageHistoryQueryDto } from './dto/get-project-usage-history-query.dto';
import { ProjectUsageHistoryResponseDto } from './dto/project-usage-history-response.dto';
import { ProjectUsageStatsQueryDto } from './dto/project-usage-stats-query.dto';
import { ProjectUsageStatsDto } from './dto/project-usage-stats.dto';
import { ProjectAccessService } from './project-access.service';
import { PROJECT_USAGE_STORE, type ProjectUsageStore } from './project.port';
import { getProjectUsageStats as getProjectUsageStatsImplementation } from './project-usage-statistics';

@Injectable()
export class ProjectUsageService {
  constructor(
    @Inject(PROJECT_USAGE_STORE) private readonly usageStore: ProjectUsageStore,
    private readonly projectAccessService: ProjectAccessService,
  ) {}

  async getProjectUsageHistory(
    userId: number,
    projectId: number,
    query: GetProjectUsageHistoryQueryDto,
  ): Promise<ProjectUsageHistoryResponseDto> {
    await this.projectAccessService.getAccessOrThrow(userId, projectId);

    const { data, total } = await this.usageStore.listUsageHistory(
      projectId,
      { startDate: query.startDate, endDate: query.endDate },
      { page: query.page, limit: query.limit },
    );

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
    await this.projectAccessService.getAccessOrThrow(userId, projectId);
    return getProjectUsageStatsImplementation(
      {
        getBillingConfiguration: () => this.getBillingConfiguration(),
        readAggregates: (range) => this.usageStore.readAggregates(projectId, range),
      },
      query,
    );
  }

  private async getBillingConfiguration(): Promise<{ currency: Currency; minorUnit: number }> {
    const currencyValue = ((await this.usageStore.readBillingCurrency()) as Currency | null) ?? Currency.EUR;

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
