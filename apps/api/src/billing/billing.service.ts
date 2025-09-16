import {
  BillingTransaction,
  ResourceBillingConfiguration,
  User,
  BillingTransactionStatus,
  Setting,
  BillingTransactionItem,
  ResourceUsage,
  ResourceFlowNodeType,
} from '@attraccess/database-entities';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UserNotFoundException } from '../exceptions/user.notFound.exception';
import { PaginationOptions } from '../types/request';
import { TransactionsDto } from './dto/transactions.dto';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { ResourceBillingConfigurationNotFoundException } from './errors/resource-billing-configuration-not-found.error';
import { UpdateResourceBillingConfigurationDto } from './dto/update-resource-billing-configuration.dto';
import { LiveNotificationsService } from './liveNotificationsService';
import { Currency, SetBillingConfigurationDto } from './dto/set-configuration.dto';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { ResourceFlowsExecutorService } from '../resources/flows/resource-flows-executor.service';

@Injectable()
export class BillingService {
  constructor(
    @InjectRepository(BillingTransaction)
    private readonly billingTransactionRepository: Repository<BillingTransaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(ResourceBillingConfiguration)
    private readonly resourceBillingConfigurationRepository: Repository<ResourceBillingConfiguration>,
    private readonly liveNotificationsService: LiveNotificationsService,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(BillingTransactionItem)
    private readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
    private readonly resourceFlowsExecutorService: ResourceFlowsExecutorService,
  ) {}

  async setConfiguration(nextConfigurationData: SetBillingConfigurationDto): Promise<BillingConfigurationDto> {
    if (!Object.values(Currency).includes(nextConfigurationData.currency)) {
      throw new BadRequestException('Invalid currency');
    }

    const existingCurrency = await this.settingRepository.findOneBy({
      parent: 'billing',
      key: 'currency',
    });

    if (existingCurrency) {
      await this.settingRepository.update(existingCurrency.id, {
        value: nextConfigurationData.currency,
      });
    } else {
      await this.settingRepository.insert({
        parent: 'billing',
        key: 'currency',
        value: nextConfigurationData.currency,
      });
    }

    return await this.getConfiguration();
  }

  public async getConfiguration(): Promise<BillingConfigurationDto> {
    const currency = await this.settingRepository.findOneBy({
      parent: 'billing',
      key: 'currency',
    });
    let currencyValue = Currency.EUR;
    if (currency) {
      currencyValue = (currency.value as Currency) ?? Currency.EUR;
    }

    let minorUnit: number;
    switch (currencyValue) {
      case Currency.EUR:
        minorUnit = 2;
        break;

      default:
        const exhaustiveCheck: never = currencyValue;
        throw new Error(`Unsupported currency: ${exhaustiveCheck}`);
    }

    return {
      currency: currencyValue,
      minorUnit,
    };
  }

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
      relations: ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf', 'items'],
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

    if (amount % 1 !== 0) {
      throw new BadRequestException('Amount must be an integer (multiply by currency minor unit)');
    }

    const currentBalance = user.creditBalance;

    const amountIsNegative = amount < 0;

    if (amountIsNegative && failOnInsufficientBalance && currentBalance + amount < 0) {
      throw new InsufficientBalanceError();
    }

    const transaction = await this.billingTransactionRepository.save({
      userId,
      initiatorId,
      amount,
      status: BillingTransactionStatus.Completed,
    });

    this.liveNotificationsService.notifyTransactionUpdate(transaction);

    return transaction;
  }

  async getResourceBillingConfiguration(
    resourceId: number,
    transactionManager?: EntityManager,
  ): Promise<ResourceBillingConfiguration> {
    const repository = transactionManager
      ? transactionManager.getRepository(ResourceBillingConfiguration)
      : this.resourceBillingConfigurationRepository;

    let configuration = await repository.findOneBy({ resourceId });
    if (!configuration) {
      configuration = repository.create({
        resourceId,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
      });
      configuration = await repository.save(configuration);
    }
    return configuration;
  }

  async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfiguration> {
    const configuration = await this.resourceBillingConfigurationRepository.findOneBy({ resourceId });
    if (!configuration) {
      throw new ResourceBillingConfigurationNotFoundException(resourceId);
    }

    if (data.creditsPerMinute === null) {
      data.creditsPerMinute = 0;
    }
    if (data.creditsPerMinute !== undefined) {
      if (data.creditsPerMinute < 0) {
        throw new BadRequestException('Credits per minute cannot be negative');
      }
      configuration.creditsPerMinute = data.creditsPerMinute;
    }

    if (data.creditsPerUsage === null) {
      data.creditsPerUsage = 0;
    }
    if (data.creditsPerUsage !== undefined) {
      if (data.creditsPerUsage < 0) {
        throw new BadRequestException('Credits per usage cannot be negative');
      }
      configuration.creditsPerUsage = data.creditsPerUsage;
    }

    if (data.creditsPerUsage !== undefined && data.creditsPerUsage % 1 !== 0) {
      throw new BadRequestException('Credits per usage must be an integer (multiply by currency minor unit)');
    }

    if (data.creditsPerMinute !== undefined && data.creditsPerMinute % 1 !== 0) {
      throw new BadRequestException('Credits per minute must be an integer (multiply by currency minor unit)');
    }

    return await this.resourceBillingConfigurationRepository.save(configuration);
  }

  private isBillingItem(
    item: object,
  ): item is Pick<BillingTransactionItem, 'name' | 'value' | 'description' | 'externalReference'> {
    return (
      item &&
      typeof item === 'object' &&
      'name' in item &&
      'value' in item &&
      'description' in item &&
      'externalReference' in item
    );
  }

  async chargeForResourceUsage(usage: ResourceUsage, transactionManager?: EntityManager): Promise<BillingTransaction> {
    const existingTransaction = await transactionManager.findOneBy(BillingTransaction, { resourceUsageId: usage.id });
    if (existingTransaction) {
      throw new BadRequestException('Billing transaction already exists for this resource usage');
    }

    const doCalculation = async (manager: EntityManager) => {
      const configuration = await this.getResourceBillingConfiguration(usage.resource.id, manager);

      const creditsForUsageDuration = configuration.creditsPerMinute * Math.ceil(usage.usageInMinutes);
      const creditsForSession = configuration.creditsPerUsage;
      let totalCredits = creditsForUsageDuration;
      totalCredits += creditsForSession;

      const flowResults = await this.resourceFlowsExecutorService.runFlow(
        usage.resource.id,
        ResourceFlowNodeType.INPUT_RESOURCE_BILLING_CALCULATION_STARTED,
        usage,
        manager,
      );

      console.log('flowResults', flowResults);

      const customBillingItems = flowResults.filter((result) => this.isBillingItem(result));

      console.log('customBillingItems', customBillingItems);

      for (const item of customBillingItems) {
        totalCredits += item.value;
      }

      if (totalCredits === 0) {
        return;
      }

      const transaction = await manager.save(BillingTransaction, {
        userId: usage.userId,
        resourceUsageId: usage.id,
        amount: -totalCredits,
        status: BillingTransactionStatus.Completed,
      } as Partial<BillingTransaction>);

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_SESSION',
        value: creditsForSession,
      });

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_MINUTE',
        value: creditsForUsageDuration,
      });

      for (const item of customBillingItems) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: transaction.id,
          name: item.name,
          value: item.value,
          description: item.description,
          externalReference: item.externalReference,
        });
      }

      this.liveNotificationsService.notifyTransactionUpdate(transaction);

      return transaction;
    };

    if (transactionManager) {
      return await doCalculation(transactionManager);
    }

    return await this.billingTransactionItemRepository.manager.transaction(async (transactionalEntityManager) => {
      return await doCalculation(transactionalEntityManager);
    });
  }
}
