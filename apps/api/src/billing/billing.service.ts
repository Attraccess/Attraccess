import {
  BillingTransaction,
  ResourceBillingConfiguration,
  ResourceUsageAction,
  User,
} from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { PaginationOptions } from '../types/request';
import { TransactionsDto } from './dto/transactions.dto';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageEvent } from '../resources/usage/events/resource-usage.events';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingTransaction)
    private readonly billingTransactionRepository: Repository<BillingTransaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ResourceBillingConfiguration)
    private readonly resourceBillingConfigurationRepository: Repository<ResourceBillingConfiguration>,
  ) {}

  async getBalance(userId: number): Promise<number> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return user.creditBalance;
  }

  async getHistory(userId: number, options: PaginationOptions): Promise<TransactionsDto> {
    const { page, limit } = options;

    const [transactions, total] = await this.billingTransactionRepository.findAndCount({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      relations: ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf'],
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      data: transactions,
      total,
      page,
      limit,
    };
  }

  async createManualTransaction(
    userId: number,
    initiatorId: number,
    amount: number,
    failOnInsufficientBalance = true,
  ): Promise<BillingTransaction> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    const currentBalance = user.creditBalance;

    const amountIsNegative = amount < 0;

    if (amountIsNegative && failOnInsufficientBalance && currentBalance + amount < 0) {
      throw new InsufficientBalanceError();
    }

    return await this.billingTransactionRepository.save({ userId, initiatorId, amount });
  }

  async getResourceBillingConfiguration(resourceId: number): Promise<ResourceBillingConfiguration> {
    let configuration = await this.resourceBillingConfigurationRepository.findOneBy({ resourceId });
    if (!configuration) {
      configuration = this.resourceBillingConfigurationRepository.create({
        resourceId,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
      });
      configuration = await this.resourceBillingConfigurationRepository.save(configuration);
    }
    return configuration;
  }

  async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfiguration> {
    const existingConfiguration = await this.resourceBillingConfigurationRepository.findOneBy({ resourceId });
    if (!existingConfiguration) {
      throw new ResourceBillingConfigurationNotFoundException(resourceId);
    }
    return await this.resourceBillingConfigurationRepository.save({ ...existingConfiguration, ...data });
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  async handleResourceUsageEvent(event: ResourceUsageEvent) {
    const { usage } = event;
    if (usage.usageAction !== ResourceUsageAction.Usage) {
      return;
    }

    if (usage.endTime === null) {
      return;
    }

    const configuration = await this.getResourceBillingConfiguration(usage.resource.id);

    let credits = configuration.creditsPerMinute * Math.ceil(usage.usageInMinutes);
    credits += configuration.creditsPerUsage;

    console.log('credits', credits);
    console.log('usage.usageInMinutes', usage.usageInMinutes);
    console.log('configuration.creditsPerMinute', configuration.creditsPerMinute);
    console.log('configuration.creditsPerUsage', configuration.creditsPerUsage);

    if (credits === 0) {
      return;
    }

    await this.billingTransactionRepository.save({
      userId: usage.userId,
      resourceUsageId: usage.id,
      amount: -credits,
    } as Partial<BillingTransaction>);
  }
}
