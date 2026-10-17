import { Injectable } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { AnalyticsPersistence } from './persistence/port';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from '../resources/operating-intervals/resource-operating-attribution.service';

@Injectable()
export class AnalyticsService {
  public constructor(
    private readonly persistence: AnalyticsPersistence,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {}

  public async getResourceUsageHoursInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    return this.persistence.usageReportPage({ ...dateRange, page, limit });
  }

  public async getBillingTransactionsInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    return this.persistence.billingReportPage({ ...dateRange, page, limit });
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
}
