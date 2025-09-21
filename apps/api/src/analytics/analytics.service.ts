import { Injectable } from '@nestjs/common';
import { DateRangeValue } from './dtos/dateRangeValue';
import { BillingTransaction, ResourceUsage } from '@attraccess/database-entities';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindManyOptions, Repository } from 'typeorm';

@Injectable()
export class AnalyticsService {
  public constructor(
    @InjectRepository(ResourceUsage)
    private resourceUsageRepository: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction)
    private billingTransactionRepository: Repository<BillingTransaction>,
  ) {}

  public async getResourceUsageHoursInDateRange(dateRange: DateRangeValue) {
    const findOptions: FindManyOptions<ResourceUsage> = {
      where: {
        startTime: Between(dateRange.start, dateRange.end),
      },
      order: {
        startTime: 'DESC',
        id: 'DESC',
        userId: 'DESC',
      },
      relations: ['user', 'resource'],
    };

    return await this.resourceUsageRepository.find(findOptions);
  }

  public async getBillingTransactionsInDateRange(dateRange: DateRangeValue) {
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
    };

    return await this.billingTransactionRepository.find(findOptions);
  }
}
