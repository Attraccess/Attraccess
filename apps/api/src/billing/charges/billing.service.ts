import { AUDIT_COMMIT_BOUNDARY } from '../../audit/persistence/port';
import {
  BillingTransaction,
  BillingTransactionStatus,
  ResourceFlowNodeType,
  ResourceUsage,
  User,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { BillingPersistence } from '../persistence/port';

import { DatabaseTransactions, TransactionScope } from '../../database/transaction-scope';

import { AuditService } from '../../audit/audit.service';

import { EmailService } from '../../email/email.service';

import { MetricsService } from '../../metrics/metrics.service';

import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';

import { InsufficientBalanceError } from '../errors/insufficient-balance.error';

import { LiveNotificationsService } from '../live-notifications/live-notifications.service';

import { BillingLedger } from '../accounting/billing-ledger';

import { applyBillingFactor, toExactCredits } from '@attraccess/shared';

@Injectable()
export class BillingService extends BillingLedger {
  constructor(
    @Inject(BillingPersistence) protected readonly persistence: BillingPersistence,
    protected readonly transactions: DatabaseTransactions,
    protected readonly liveNotificationsService: LiveNotificationsService,
    protected readonly resourceFlowsService: ResourceFlowsService,
    protected readonly emailService: EmailService,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly auditService: AuditService,
  ) {
    super();
  }

  protected readonly logger = new Logger(BillingService.name);

  /** Validate a tentative start without creating an externally visible billing transaction. */
  public async validateResourceUsageStart(
    resourceId: number,
    usage: ResourceUsage,
    user: User,
    scope?: TransactionScope,
  ) {
    const resourceBillingConfiguration = await this.getResourceBillingConfiguration(resourceId, scope);

    if (await this.isBillingEnabled(resourceId, scope, usage)) {
      const balance = await this.getBalance(user.id, scope);
      const sessionDurationRate =
        usage.sessionDurationCreditsPerMinute ?? resourceBillingConfiguration.creditsPerMinute;
      const creditsPerUsage = usage.creditsPerUsage ?? resourceBillingConfiguration.creditsPerUsage;
      if (balance < creditsPerUsage + sessionDurationRate) {
        throw new InsufficientBalanceError();
      }
    }
  }

  public async handleResourceUsageStart(
    resourceId: number,
    usage: ResourceUsage,
    user: User,
    scope?: TransactionScope,
  ) {
    await this.validateResourceUsageStart(resourceId, usage, user, scope);

    const transaction = await this.operations(scope).createTransaction({
      userId: user.id,
      resourceUsageId: usage.id,
      amount: 0,
      status: BillingTransactionStatus.Pending,
    });
    void this.auditService.recordBillingTransactionAfterCommit(
      {
        transactionId: transaction.id,
        userId: transaction.userId,
        amount: transaction.amount,
        status: transaction.status,
        source: 'resource-usage',
      },
      scope?.resolve(AUDIT_COMMIT_BOUNDARY),
    );
  }

  public async isBillingEnabled(resourceId: number, scope?: TransactionScope, usage?: ResourceUsage) {
    const configuration = await this.getResourceBillingConfiguration(resourceId, scope);
    if (
      (usage?.creditsPerUsage ?? configuration.creditsPerUsage) > 0 ||
      (usage?.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute) > 0 ||
      (usage?.operatingDurationCreditsPerMinute ?? configuration.creditsPerOperatingMinute) > 0 ||
      (usage?.meterRates
        ? usage.meterRates.some((meter) => meter.creditsPerUnit > 0)
        : (await this.operations(scope).positiveMeterCount(resourceId)) > 0)
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

  public async chargeForResourceUsage(
    usage: ResourceUsage,
    transactionManager?: TransactionScope,
  ): Promise<BillingTransaction> {
    const doCalculation = async (manager: TransactionScope) => {
      const existingTransaction = await this.operations(manager).completedUsageCharge(usage.id);
      if (existingTransaction)
        throw new BadRequestException('Billing transaction already exists for this resource usage');
      const configuration = await this.getResourceBillingConfiguration(usage.resource.id, manager);

      const sessionDurationRate = usage.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute;
      const operatingDurationRate = usage.operatingDurationCreditsPerMinute ?? 0;
      const sessionDurationMs = usage.endTime ? Math.max(0, usage.endTime.getTime() - usage.startTime.getTime()) : 0;
      // Attribution originates from integer-millisecond intervals; remove only minute-storage float noise.
      const operatingDurationMs = Math.round((usage.attributedOperatingDurationInMinutes ?? 0) * 60_000);
      const roundedMinutes = Math.ceil(sessionDurationMs / 60_000);
      const roundedOperatingMinutes = Math.ceil(operatingDurationMs / 60_000);
      // Legacy sessions have no complete snapshot; preserve their existing configuration fallback.
      const creditsForSession = usage.creditsPerUsage ?? configuration.creditsPerUsage;
      let grossCredits =
        toExactCredits(sessionDurationRate) * toExactCredits(roundedMinutes) +
        toExactCredits(operatingDurationRate) * toExactCredits(roundedOperatingMinutes) +
        toExactCredits(creditsForSession);

      const persistence = this.operations(manager);
      let transaction = await persistence.usageTransactionWithItems(usage.id);

      if (grossCredits === BigInt(0) && !transaction) {
        return;
      }

      (transaction?.items ?? []).forEach((item) => {
        grossCredits += toExactCredits(item.unitPrice) * toExactCredits(item.quantity);
      });

      const billingFactor = usage.billingFactor ?? usage.user.billingFactor;
      const { amount: totalCredits, discount: billingFactorDiscountAmount } = applyBillingFactor(
        grossCredits,
        billingFactor,
      );

      if (transaction) {
        const previousStatus = transaction.status;
        await persistence.completeTransaction(transaction.id, -totalCredits);

        transaction.amount = -totalCredits;
        transaction.status = BillingTransactionStatus.Completed;
        void this.auditService.recordBillingTransactionAfterCommit(
          {
            transactionId: transaction.id,
            userId: transaction.userId,
            amount: transaction.amount,
            status: transaction.status,
            previousStatus,
            source: 'resource-usage',
          },
          manager.resolve(AUDIT_COMMIT_BOUNDARY),
        );
      } else {
        transaction = await persistence.createTransaction({
          userId: usage.userId,
          resourceUsageId: usage.id,
          amount: -totalCredits,
          status: BillingTransactionStatus.Completed,
        });
        void this.auditService.recordBillingTransactionAfterCommit(
          {
            transactionId: transaction.id,
            userId: transaction.userId,
            amount: transaction.amount,
            status: transaction.status,
            source: 'resource-usage',
          },
          manager.resolve(AUDIT_COMMIT_BOUNDARY),
        );
      }

      await persistence.saveItem({
        billingTransactionId: transaction.id,
        name: 'PER_SESSION',
        unitPrice: creditsForSession,
        quantity: 1,
      });

      await persistence.saveItem({
        billingTransactionId: transaction.id,
        name: 'PER_MINUTE',
        durationMs: sessionDurationMs,
        unitPrice: sessionDurationRate,
        quantity: roundedMinutes,
      });

      if (operatingDurationRate > 0) {
        await persistence.saveItem({
          billingTransactionId: transaction.id,
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          durationMs: operatingDurationMs,
          unitPrice: operatingDurationRate,
          quantity: roundedOperatingMinutes,
        });
      }

      if (billingFactorDiscountAmount !== 0) {
        await persistence.saveItem({
          billingTransactionId: transaction.id,
          name: 'BILLING_FACTOR',
          description: `${billingFactor}%`,
          unitPrice: -billingFactorDiscountAmount,
          quantity: 1,
        });
      }

      return transaction;
    };

    if (transactionManager) {
      return await doCalculation(transactionManager);
    }

    const transaction = await this.transactions.run(
      { resourceIds: [usage.resourceId], accountIds: usage.userId == null ? [] : [usage.userId] },
      doCalculation,
    );
    if (transaction) await this.notifyResourceUsageCharge(transaction.id);
    return transaction;
  }

  /** Publish a completed charge only after its owning usage transaction has committed. */
  async notifyResourceUsageCharge(transactionId: number): Promise<void> {
    try {
      const transaction = await this.persistence.chargeForNotification(transactionId);
      if (!transaction) return;

      this.liveNotificationsService.notifyTransactionUpdate(transaction);
      if (!transaction.user?.email || !transaction.resourceUsage || transaction.amount === 0) return;

      const configuration = await this.getConfiguration();
      await this.emailService.sendResourceUsageBillingSummaryEmail(
        transaction.user,
        transaction,
        transaction.resourceUsage,
        configuration.minorUnit,
      );
    } catch (error) {
      // A receipt delivery failure must not change an already committed charge.
      this.logger.warn(`Failed to publish resource usage charge ${transactionId}`, error);
    }
  }
}
