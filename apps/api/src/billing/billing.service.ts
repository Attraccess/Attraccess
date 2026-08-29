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
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
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
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { EmailService } from '../email/email.service';
import { BillingTransactionNotFoundException } from './errors/billing-transaction-not-found.error';
import { RefundAmountHigherThanTransactionAmountException } from './errors/refund-amount-higher-than-transaction-amount.error';
import { RefundTransactionDto } from './dto/refund-transaction.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceBillingConfigurationChangedEvent } from './events/resource-billing-configuration-changed.event';
import { MetricsService } from '../metrics/metrics.service';

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
    private readonly resourceFlowsService: ResourceFlowsService,
    private readonly emailService: EmailService,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
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

      default: {
        const exhaustiveCheck: never = currencyValue;
        throw new Error(`Unsupported currency: ${exhaustiveCheck}`);
      }
    }

    return {
      currency: currencyValue,
      minorUnit,
    };
  }

  async getBalance(userId: number, transactionalEntityManager?: EntityManager): Promise<number> {
    const userRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(User)
      : this.userRepository;

    const user = await userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return user.creditBalance;
  }

  private DEFAULT_RELATIONS = ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf', 'items'];

  async getHistory(userId: number, options: PaginationOptions): Promise<TransactionsDto> {
    const { page, limit } = options;

    const [transactions, total] = await this.billingTransactionRepository.findAndCount({
      where: { userId },
      skip: (page - 1) * limit,
      take: limit,
      relations: this.DEFAULT_RELATIONS,
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return {
      data: transactions,
      total,
      page,
      limit,
    };
  }

  async getTransaction(transactionId: number, userId?: number): Promise<BillingTransaction> {
    return await this.billingTransactionRepository.findOne({
      where: { id: transactionId, userId },
      relations: this.DEFAULT_RELATIONS,
    });
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
    this.metricsService.billingTransactionsTotal.inc({ status: transaction.status });
    if (amount) {
      this.metricsService.billingTransactionAmount.observe(Math.abs(amount));
    }

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
        creditsPerOperatingMinute: 0,
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

    if (data.creditsPerOperatingMinute === null) {
      data.creditsPerOperatingMinute = 0;
    }
    if (data.creditsPerOperatingMinute !== undefined) {
      if (data.creditsPerOperatingMinute < 0) {
        throw new BadRequestException('Credits per operating minute cannot be negative');
      }
      configuration.creditsPerOperatingMinute = data.creditsPerOperatingMinute;
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
    if (data.creditsPerOperatingMinute !== undefined && data.creditsPerOperatingMinute % 1 !== 0) {
      throw new BadRequestException('Credits per operating minute must be an integer (multiply by currency minor unit)');
    }

    const savedConfiguration = await this.resourceBillingConfigurationRepository.save(configuration);
    this.eventEmitter.emit(
      ResourceBillingConfigurationChangedEvent.EVENT_NAME,
      new ResourceBillingConfigurationChangedEvent(resourceId),
    );
    return savedConfiguration;
  }

  async chargeForResourceUsage(usage: ResourceUsage, transactionManager?: EntityManager): Promise<BillingTransaction> {
    let existingTransaction: BillingTransaction | null;
    if (transactionManager) {
      existingTransaction = await transactionManager.findOneBy(BillingTransaction, {
        resourceUsageId: usage.id,
        status: BillingTransactionStatus.Completed,
      });
    } else {
      existingTransaction = await this.billingTransactionRepository.findOneBy({
        resourceUsageId: usage.id,
        status: BillingTransactionStatus.Completed,
      });
    }
    if (existingTransaction) {
      throw new BadRequestException('Billing transaction already exists for this resource usage');
    }

    const doCalculation = async (manager: EntityManager) => {
      const configuration = await this.getResourceBillingConfiguration(usage.resource.id, manager);

      const sessionDurationRate = usage.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute;
      const operatingDurationRate = usage.operatingDurationCreditsPerMinute ?? 0;
      const roundedMinutes = Math.ceil(usage.usageInMinutes);
      const roundedOperatingMinutes = Math.ceil(usage.attributedOperatingDurationInMinutes ?? 0);
      const creditsForUsageDuration = sessionDurationRate * roundedMinutes;
      const creditsForOperatingDuration = operatingDurationRate * roundedOperatingMinutes;
      const creditsForSession = configuration.creditsPerUsage;
      let totalCredits = creditsForUsageDuration + creditsForOperatingDuration;
      totalCredits += creditsForSession;

      let transaction = await manager.findOne(BillingTransaction, {
        where: {
          resourceUsageId: usage.id,
        },
        relations: ['items'],
      });

      if (totalCredits === 0 && !transaction) {
        return;
      }

      (transaction?.items ?? []).forEach((item) => {
        totalCredits += item.unitPrice * item.quantity;
      });

      const billingFactorDiscountAmount = Math.round(totalCredits - totalCredits * (usage.user.billingFactor / 100));
      totalCredits = totalCredits - billingFactorDiscountAmount;

      if (transaction) {
        await manager.update(BillingTransaction, transaction.id, {
          amount: -totalCredits,
          status: BillingTransactionStatus.Completed,
        });

        transaction.amount = -totalCredits;
        transaction.status = BillingTransactionStatus.Completed;
      } else {
        transaction = await manager.save(BillingTransaction, {
          userId: usage.userId,
          resourceUsageId: usage.id,
          amount: -totalCredits,
          status: BillingTransactionStatus.Completed,
        } as Partial<BillingTransaction>);
      }

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_SESSION',
        unitPrice: configuration.creditsPerUsage,
        quantity: 1,
      });

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_MINUTE',
        unitPrice: sessionDurationRate,
        quantity: roundedMinutes,
      });

      if (operatingDurationRate > 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: transaction.id,
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          unitPrice: operatingDurationRate,
          quantity: roundedOperatingMinutes,
        });
      }

      if (billingFactorDiscountAmount !== 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: transaction.id,
          name: 'BILLING_FACTOR',
          description: `${usage.user.billingFactor}%`,
          unitPrice: -billingFactorDiscountAmount,
          quantity: 1,
        });
      }

      this.liveNotificationsService.notifyTransactionUpdate(transaction);

      const freshUser = await manager.findOne(User, { where: { id: transaction.userId } });
      if (freshUser?.email) {
        try {
          // load items relation if not present
          // Ensure items relation is loaded
          transaction = await manager.findOne(BillingTransaction, {
            where: { id: transaction.id },
            relations: ['items'],
          });
          const billingConfiguration = await this.getConfiguration();

          if (transaction.amount !== 0) {
            await this.emailService.sendResourceUsageBillingSummaryEmail(
              freshUser,
              transaction,
              usage,
              billingConfiguration.minorUnit,
            );
          }
        } catch {
          // ignore email failures to not break billing
        }
      }

      return transaction;
    };

    if (transactionManager) {
      return await doCalculation(transactionManager);
    }

    return await this.billingTransactionItemRepository.manager.transaction(async (transactionalEntityManager) => {
      return await doCalculation(transactionalEntityManager);
    });
  }

  public async handleResourceUsageStart(
    resourceId: number,
    usage: ResourceUsage,
    user: User,
    transactionalEntityManager?: EntityManager,
  ) {
    const resourceBillingConfiguration = await this.getResourceBillingConfiguration(
      resourceId,
      transactionalEntityManager,
    );

    if (await this.isBillingEnabled(resourceId, transactionalEntityManager)) {
      const balance = await this.getBalance(user.id, transactionalEntityManager);
      const sessionDurationRate = usage.sessionDurationCreditsPerMinute ?? resourceBillingConfiguration.creditsPerMinute;
      if (balance < resourceBillingConfiguration.creditsPerUsage + sessionDurationRate) {
        throw new InsufficientBalanceError();
      }
    }

    const transactionRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(BillingTransaction)
      : this.billingTransactionRepository;

    await transactionRepository.save({
      userId: user.id,
      resourceUsageId: usage.id,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
  }

  public async isBillingEnabled(resourceId: number, transactionalEntityManager?: EntityManager) {
    const configuration = await this.getResourceBillingConfiguration(resourceId, transactionalEntityManager);
    if (
      configuration.creditsPerUsage > 0 ||
      configuration.creditsPerMinute > 0 ||
      configuration.creditsPerOperatingMinute > 0
    ) {
      return true;
    }

    const setAdditionalItemsFlowNodes = await this.resourceFlowsService.getNodes(
      resourceId,
      ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
    );
    if (setAdditionalItemsFlowNodes.length > 0) {
      return true;
    }

    return false;
  }

  public async refundTransaction(executingUserId: number, transactionId: number, data: RefundTransactionDto) {
    const transaction = await this.getTransaction(transactionId);

    if (!transaction) {
      throw new BillingTransactionNotFoundException();
    }

    if (data.amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    if (data.amount > Math.abs(transaction.amount)) {
      throw new RefundAmountHigherThanTransactionAmountException();
    }

    const refundAmount = transaction.amount > 0 ? -data.amount : data.amount;

    const refundTransaction = await this.billingTransactionRepository.save({
      userId: transaction.userId,
      initiatorId: executingUserId,
      amount: refundAmount,
      status: BillingTransactionStatus.Completed,
      refundOfId: transaction.id,
    } as Partial<BillingTransaction>);

    this.liveNotificationsService.notifyTransactionUpdate(transaction);

    return await this.getTransaction(refundTransaction.id);
  }
}
