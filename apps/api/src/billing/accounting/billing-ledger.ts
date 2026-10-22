import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceBillingConfiguration,
} from '@attraccess/application-models';

import { BadRequestException, Logger } from '@nestjs/common';

import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';
import { BILLING_OPERATIONS, BillingPersistence } from '../persistence/port';

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
  async getBalance(userId: number, scope?: TransactionScope): Promise<number> {
    const user = await this.operations(scope).balance(userId);
    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return user.creditBalance;
  }

  async getTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    return this.persistence.transactionIdForUsage(usageId, userId);
  }

  async getHistory(userId: number, options: PaginationOptions): Promise<TransactionsDto> {
    const { page, limit } = options;

    const [transactions, total] = await this.persistence.history(userId, (page - 1) * limit, limit);

    return {
      data: transactions,
      total,
      page,
      limit,
    };
  }

  async getTransaction(transactionId: number, userId?: number): Promise<BillingTransaction> {
    return this.persistence.transaction(transactionId, userId);
  }

  async getResourceUsageCharge(resourceUsageId: number, userId: number): Promise<BillingTransaction | null> {
    return this.persistence.completedUsageCharge(resourceUsageId, userId);
  }

  async createManualTransaction(
    userId: number,
    initiatorId: number,
    amount: number,
    failOnInsufficientBalance = true,
  ): Promise<BillingTransaction> {
    const transaction = await this.transactions.run({ resourceIds: [], accountIds: [userId] }, async (scope) => {
      const user = await this.operations(scope).balance(userId);
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

      return await this.operations(scope).createTransaction({
        userId,
        initiatorId,
        amount,
        status: BillingTransactionStatus.Completed,
      });
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

    const refundTransaction = await this.transactions.run(
      { resourceIds: [], accountIds: [transaction.userId] },
      async (scope) => {
        const current = await this.operations(scope).transaction(transactionId);
        if (!current) throw new BillingTransactionNotFoundException();
        if (data.amount <= 0) throw new BadRequestException('Amount must be greater than 0');
        if (data.amount > Math.abs(current.amount)) throw new RefundAmountHigherThanTransactionAmountException();
        const refundAmount = current.amount > 0 ? -data.amount : data.amount;
        return this.operations(scope).createTransaction({
          userId: current.userId,
          initiatorId: executingUserId,
          amount: refundAmount,
          status: BillingTransactionStatus.Completed,
          refundOfId: current.id,
        });
      },
    );

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

    await this.persistence.setCurrency(nextConfigurationData.currency);

    return await this.getConfiguration();
  }

  public async getConfiguration(): Promise<BillingConfigurationDto> {
    const currency = await this.persistence.currency();
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
    transactionManager?: TransactionScope,
  ): Promise<ResourceBillingConfiguration> {
    const persistence = this.operations(transactionManager);
    let configuration = await persistence.resourceConfiguration(resourceId);
    if (!configuration) {
      configuration = await persistence.saveResourceConfiguration({
        resourceId,
        creditsPerUsage: 0,
        creditsPerMinute: 0,
        creditsPerOperatingMinute: 0,
      });
    }
    return configuration;
  }

  public async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfiguration> {
    const configuration = await this.persistence.resourceConfiguration(resourceId);
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

    const savedConfiguration = await this.persistence.saveResourceConfiguration(configuration);
    this.eventEmitter.emit(
      ResourceBillingConfigurationChangedEvent.EVENT_NAME,
      new ResourceBillingConfigurationChangedEvent(resourceId),
    );
    return savedConfiguration;
  }

  protected operations(scope?: TransactionScope): BillingPersistence {
    return scope ? scope.resolve(BILLING_OPERATIONS) : this.persistence;
  }

  protected abstract readonly persistence: BillingPersistence;
  protected abstract readonly transactions: DatabaseTransactions;

  protected abstract readonly liveNotificationsService: LiveNotificationsService;

  protected abstract readonly auditService: AuditService;

  protected abstract readonly metricsService: MetricsService;

  protected abstract readonly eventEmitter: EventEmitter2;

  public abstract notifyResourceUsageCharge(transactionId: number): Promise<void>;

  protected abstract readonly emailService: EmailService;

  protected abstract readonly logger: Logger;
}
