import {
  BillingTransaction,
  BillingTransactionStatus,
  User,
  ResourceBillingConfiguration,
  BillingTransactionItem,
  Setting,
} from '@attraccess/database-entities';

import { BadRequestException, Logger } from '@nestjs/common';

import { EntityManager, Repository } from 'typeorm';

import { UserNotFoundException } from '../../exceptions/user.notFound.exception';

import { PaginationOptions } from '../../types/request';

import { RefundTransactionDto } from '../dto/refund-transaction.dto';

import { TransactionsDto } from '../dto/transactions.dto';

import { BillingTransactionNotFoundException } from '../errors/billing-transaction-not-found.error';

import { InsufficientBalanceError } from '../errors/insufficient-balance.error';

import { RefundAmountHigherThanTransactionAmountException } from '../errors/refund-amount-higher-than-transaction-amount.error';

import { BillingConfigurationDto } from '../dto/configuration.dto';

import { Currency, SetBillingConfigurationDto } from '../dto/set-configuration.dto';

import { UpdateResourceBillingConfigurationDto } from '../dto/update-resource-billing-configuration.dto';

import { ResourceBillingConfigurationNotFoundException } from '../errors/resource-billing-configuration-not-found.error';

import { ResourceBillingConfigurationChangedEvent } from '../events/resource-billing-configuration-changed.event';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AuditService } from '../../audit/audit.service';

import { EmailService } from '../../email/email.service';

import { MetricsService } from '../../metrics/metrics.service';

import { LiveNotificationsService } from '../live-notifications/live-notifications.service';

export abstract class BillingLedger {
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

  async getTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    const transaction = await this.billingTransactionRepository.findOne({
      where: { resourceUsageId: usageId, userId },
      select: ['id'],
    });
    return transaction?.id ?? null;
  }

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

  async getResourceUsageCharge(resourceUsageId: number, userId: number): Promise<BillingTransaction | null> {
    return this.billingTransactionRepository.findOneBy({
      resourceUsageId,
      userId,
      status: BillingTransactionStatus.Completed,
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
    void this.auditService.recordBillingTransaction({
      transactionId: transaction.id,
      userId,
      initiatorId,
      amount,
      status: BillingTransactionStatus.Completed,
      source: 'manual',
    });
    this.metricsService.billingTransactionsTotal.inc({ status: transaction.status });
    if (amount) {
      this.metricsService.billingTransactionAmount.observe(Math.abs(amount));
    }

    return transaction;
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

    this.liveNotificationsService.notifyTransactionUpdate(refundTransaction);
    void this.auditService.recordBillingTransaction({
      transactionId: refundTransaction.id,
      userId: refundTransaction.userId,
      initiatorId: executingUserId,
      amount: refundTransaction.amount,
      status: refundTransaction.status,
      source: 'refund',
    });

    return await this.getTransaction(refundTransaction.id);
  }

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

  public async getResourceBillingConfiguration(
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

  public async updateResourceBillingConfiguration(
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
      throw new BadRequestException(
        'Credits per operating minute must be an integer (multiply by currency minor unit)',
      );
    }

    const savedConfiguration = await this.resourceBillingConfigurationRepository.save(configuration);
    this.eventEmitter.emit(
      ResourceBillingConfigurationChangedEvent.EVENT_NAME,
      new ResourceBillingConfigurationChangedEvent(resourceId),
    );
    return savedConfiguration;
  }

  protected abstract readonly settingRepository: Repository<Setting>;

  protected abstract readonly userRepository: Repository<User>;

  protected abstract readonly billingTransactionRepository: Repository<BillingTransaction>;

  protected abstract DEFAULT_RELATIONS: string[];

  protected abstract readonly liveNotificationsService: LiveNotificationsService;

  protected abstract readonly auditService: AuditService;

  protected abstract readonly metricsService: MetricsService;

  protected abstract readonly resourceBillingConfigurationRepository: Repository<ResourceBillingConfiguration>;

  protected abstract readonly eventEmitter: EventEmitter2;

  protected abstract readonly billingTransactionItemRepository: Repository<BillingTransactionItem>;

  public abstract notifyResourceUsageCharge(transactionId: number): Promise<void>;

  protected abstract readonly emailService: EmailService;

  protected abstract readonly logger: Logger;
}
