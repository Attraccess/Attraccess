import {
  BillingTransactionDetail,
  BillingTransactionPage,
  BillingTransactionRecord,
  BillingTransactionStatus,
  ResourceBillingConfigurationRecord,
} from '@attraccess/application-models';
import { BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import { AuditRecorder } from '../../audit/recorder/audit-event';
import { UserNotFoundException } from '../../exceptions/user.notFound.exception';
import { MetricsService } from '../../metrics/metrics.service';
import { PaginationOptions } from '../../types/request';
import { BillingConfigurationDto } from '../dto/configuration.dto';
import { RefundTransactionDto } from '../dto/refund-transaction.dto';
import { Currency, SetBillingConfigurationDto } from '../dto/set-configuration.dto';
import { UpdateResourceBillingConfigurationDto } from '../dto/update-resource-billing-configuration.dto';
import { BillingTransactionNotFoundException } from '../errors/billing-transaction-not-found.error';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RefundAmountHigherThanTransactionAmountException } from '../errors/refund-amount-higher-than-transaction-amount.error';
import { ResourceBillingConfigurationNotFoundException } from '../errors/resource-billing-configuration-not-found.error';
import { ResourceBillingConfigurationChangedEvent } from '../events/resource-billing-configuration-changed.event';
import { bestEffortPush } from '../live-notifications/best-effort-push';
import { LiveNotificationsService } from '../live-notifications/live-notifications.service';
import { BillingConfigurationStore } from '../ports/billing-configuration.port';
import { BillingLedgerStore, BillingTransactionContext } from '../ports/billing-ledger.port';

/** Balances, transaction history, manual and refund transactions, and the billing configuration. */
export class BillingLedger {
  private readonly logger = new Logger(BillingLedger.name);

  constructor(
    private readonly ledgerStore: BillingLedgerStore,
    private readonly configurationStore: BillingConfigurationStore,
    private readonly liveNotificationsService: LiveNotificationsService,
    private readonly auditService: AuditRecorder,
    private readonly metricsService: MetricsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getBalance(userId: number, context?: BillingTransactionContext): Promise<number> {
    const balance = await this.ledgerStore.getBalance(userId, context);
    if (balance === null) {
      throw new UserNotFoundException(userId);
    }

    return balance;
  }

  async getTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    return this.ledgerStore.findTransactionIdForUsage(usageId, userId);
  }

  async getHistory(userId: number, options: PaginationOptions): Promise<BillingTransactionPage> {
    const { page, limit } = options;
    const { transactions, total } = await this.ledgerStore.listTransactionsForUser(userId, { page, limit });
    return { data: transactions, total, page, limit };
  }

  async getTransaction(transactionId: number, userId?: number): Promise<BillingTransactionDetail | null> {
    return this.ledgerStore.findTransactionDetail(transactionId, userId);
  }

  async getResourceUsageCharge(resourceUsageId: number, userId: number): Promise<BillingTransactionRecord | null> {
    return this.ledgerStore.findCompletedUsageCharge(resourceUsageId, userId);
  }

  async createManualTransaction(
    userId: number,
    initiatorId: number,
    amount: number,
    failOnInsufficientBalance = true,
  ): Promise<BillingTransactionRecord> {
    const currentBalance = await this.ledgerStore.getBalance(userId);
    if (currentBalance === null) {
      throw new UserNotFoundException(userId);
    }

    if (amount % 1 !== 0) {
      throw new BadRequestException('Amount must be an integer (multiply by currency minor unit)');
    }

    const amountIsNegative = amount < 0;

    if (amountIsNegative && failOnInsufficientBalance && currentBalance + amount < 0) {
      throw new InsufficientBalanceError();
    }

    const transaction = await this.ledgerStore.insertTransaction({
      userId,
      initiatorId,
      amount,
      status: BillingTransactionStatus.Completed,
    });

    bestEffortPush(
      this.liveNotificationsService.notifyTransactionUpdate(transaction),
      this.logger,
      `transaction ${transaction.id}`,
    );
    void this.auditService.record(
      billingTransactionAuditEvent({
        transactionId: transaction.id,
        userId,
        initiatorId,
        amount,
        status: BillingTransactionStatus.Completed,
        source: 'manual',
      }),
    );
    this.metricsService.billingTransactionsTotal.inc({ status: transaction.status });
    if (amount) {
      this.metricsService.billingTransactionAmount.observe(Math.abs(amount));
    }

    return transaction;
  }

  public async refundTransaction(
    executingUserId: number,
    transactionId: number,
    data: RefundTransactionDto,
  ): Promise<BillingTransactionDetail | null> {
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

    const refundTransaction = await this.ledgerStore.insertTransaction({
      userId: transaction.userId,
      initiatorId: executingUserId,
      amount: refundAmount,
      status: BillingTransactionStatus.Completed,
      refundOfId: transaction.id,
    });

    bestEffortPush(
      this.liveNotificationsService.notifyTransactionUpdate(refundTransaction),
      this.logger,
      `refund ${refundTransaction.id}`,
    );
    void this.auditService.record(
      billingTransactionAuditEvent({
        transactionId: refundTransaction.id,
        userId: refundTransaction.userId,
        initiatorId: executingUserId,
        amount: refundTransaction.amount,
        status: refundTransaction.status,
        source: 'refund',
      }),
    );

    return await this.getTransaction(refundTransaction.id);
  }

  async setConfiguration(nextConfigurationData: SetBillingConfigurationDto): Promise<BillingConfigurationDto> {
    if (!Object.values(Currency).includes(nextConfigurationData.currency)) {
      throw new BadRequestException('Invalid currency');
    }

    await this.configurationStore.saveCurrency(nextConfigurationData.currency);

    return await this.getConfiguration();
  }

  public async getConfiguration(): Promise<BillingConfigurationDto> {
    const storedCurrency = await this.configurationStore.getCurrency();
    let currencyValue = Currency.EUR;
    if (storedCurrency !== null) {
      currencyValue = (storedCurrency as Currency) ?? Currency.EUR;
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
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord> {
    return this.configurationStore.getOrCreateResourceConfiguration(resourceId, context);
  }

  public async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfigurationRecord> {
    const configuration = await this.configurationStore.findResourceConfiguration(resourceId);
    if (!configuration) {
      throw new ResourceBillingConfigurationNotFoundException(resourceId);
    }
    const rates = {
      creditsPerUsage: configuration.creditsPerUsage,
      creditsPerMinute: configuration.creditsPerMinute,
      creditsPerOperatingMinute: configuration.creditsPerOperatingMinute,
      projectSwitchCharging: data.projectSwitchCharging ?? configuration.projectSwitchCharging,
    };

    if (data.creditsPerMinute === null) {
      data.creditsPerMinute = 0;
    }
    if (data.creditsPerMinute !== undefined) {
      if (data.creditsPerMinute < 0) {
        throw new BadRequestException('Credits per minute cannot be negative');
      }
      rates.creditsPerMinute = data.creditsPerMinute;
    }

    if (data.creditsPerOperatingMinute === null) {
      data.creditsPerOperatingMinute = 0;
    }
    if (data.creditsPerOperatingMinute !== undefined) {
      if (data.creditsPerOperatingMinute < 0) {
        throw new BadRequestException('Credits per operating minute cannot be negative');
      }
      rates.creditsPerOperatingMinute = data.creditsPerOperatingMinute;
    }

    if (data.creditsPerUsage === null) {
      data.creditsPerUsage = 0;
    }
    if (data.creditsPerUsage !== undefined) {
      if (data.creditsPerUsage < 0) {
        throw new BadRequestException('Credits per usage cannot be negative');
      }
      rates.creditsPerUsage = data.creditsPerUsage;
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

    const savedConfiguration = await this.configurationStore.saveResourceRates(resourceId, rates);
    this.eventEmitter.emit(
      ResourceBillingConfigurationChangedEvent.EVENT_NAME,
      new ResourceBillingConfigurationChangedEvent(resourceId),
    );
    return savedConfiguration;
  }
}
