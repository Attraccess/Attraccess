import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { BillingTransaction, ResourceUsage, ResourceUsageAction } from '@attraccess/database-entities';
import { AnalyticsPersistence, ReportPage } from './port';
import { toApplicationRecord } from '../../database/sqlite/backend';

@Injectable()
export class TypeormAnalyticsPersistence extends AnalyticsPersistence {
  constructor(
    @InjectRepository(ResourceUsage) private readonly usages: Repository<ResourceUsage>,
    @InjectRepository(BillingTransaction) private readonly transactions: Repository<BillingTransaction>,
  ) {
    super();
  }

  async usageReportPage(input: ReportPage): Promise<[ResourceUsage[], number]> {
    const [rows, total] = await this.usages.findAndCount({
      where: {
        startTime: Between(input.start, input.end),
        usageAction: ResourceUsageAction.Usage,
        lifecyclePending: false,
      },
      order: { startTime: 'DESC', id: 'DESC', userId: 'DESC' },
      relations: ['user', 'resource', 'supervisorUser'],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return [toApplicationRecord(rows), total];
  }

  async billingReportPage(input: ReportPage): Promise<[BillingTransaction[], number]> {
    const [rows, total] = await this.transactions.findAndCount({
      where: { createdAt: Between(input.start, input.end) },
      order: { createdAt: 'DESC', id: 'DESC', userId: 'DESC' },
      relations: ['user', 'resourceUsage', 'resourceUsage.resource', 'items'],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    });
    return [toApplicationRecord(rows), total];
  }
}
