import { Injectable } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { BillingTransaction, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindManyOptions, Repository } from 'typeorm';
import {
  ResourceOperatingAttributionService,
  ResourceOperatingAttributionSummary,
} from '../resources/operating-intervals/resource-operating-attribution.service';

@Injectable()
export class AnalyticsService {
  public constructor(
    @InjectRepository(ResourceUsage)
    private resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction)
    private billingTransactionRepository: Repository<BillingTransaction>,
    private readonly operatingAttributionService: ResourceOperatingAttributionService,
  ) {}

  public async getResourceUsageHoursInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    const findOptions: FindManyOptions<ResourceUsage> = {
      where: {
        startTime: Between(dateRange.start, dateRange.end),
        usageAction: ResourceUsageAction.Usage,
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

    return await this.resourceUsageRepository.findAndCount(findOptions);
  }

  public async getBillingTransactionsInDateRange(dateRange: DateRangeValue, page = 1, limit = 500) {
    const findOptions: FindManyOptions<BillingTransaction> = {
      where: {
        createdAt: Between(dateRange.start, dateRange.end),
      },
      order: {
        createdAt: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: ['user', 'resourceUsage', 'resourceUsage.resource', 'items'],
      skip: (page - 1) * limit,
      take: limit,
    };

    return await this.billingTransactionRepository.findAndCount(findOptions);
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
