import {
  BillingTransactionDetail,
  BillingTransactionPage,
  BillingTransactionRecord,
  BillingTransactionStatus,
  ResourceBillingConfigurationRecord,
  ResourceFlowNodeType,
} from '@attraccess/application-models';
import { applyBillingFactor, toExactCredits } from '@attraccess/shared';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { billingTransactionAuditEvent } from '../../audit/policies/billing';
import { AUDIT_RECORDER, AuditRecorder } from '../../audit/recorder/audit-event';
import { UNIT_OF_WORK, type UnitOfWork } from '../../database/unit-of-work';
import { EmailService } from '../../email/email.service';
import { MetricsService } from '../../metrics/metrics.service';
import { ResourceFlowsService } from '../../resources/flows/resource-flows.service';
import { OperatingShare, operatingBreakdown } from '../../resources/operating-intervals/operating-share';
import { PaginationOptions } from '../../types/request';
import { BillingLedger } from '../accounting/billing-ledger';
import { BillingConfigurationDto } from '../dto/configuration.dto';
import { RefundTransactionDto } from '../dto/refund-transaction.dto';
import { SetBillingConfigurationDto } from '../dto/set-configuration.dto';
import { UpdateResourceBillingConfigurationDto } from '../dto/update-resource-billing-configuration.dto';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { LiveNotificationsService } from '../live-notifications/live-notifications.service';
import { bestEffortPush } from '../live-notifications/best-effort-push';
import { BILLING_CONFIGURATION_STORE, BillingConfigurationStore } from '../ports/billing-configuration.port';
import {
  BILLING_LEDGER_STORE,
  BillingLedgerStore,
  BillingTransactionContext,
  NewBillingTransactionItem,
} from '../ports/billing-ledger.port';
import { BillablePriceSnapshot, BillableUsage } from './billable-usage';

@Injectable()
export class BillingService {
  private readonly ledger: BillingLedger;

  constructor(
    @Inject(BILLING_LEDGER_STORE) private readonly ledgerStore: BillingLedgerStore,
    @Inject(BILLING_CONFIGURATION_STORE) private readonly configurationStore: BillingConfigurationStore,
    private readonly liveNotificationsService: LiveNotificationsService,
    private readonly resourceFlowsService: ResourceFlowsService,
    private readonly emailService: EmailService,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
    @Inject(AUDIT_RECORDER) private readonly auditService: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {
    this.ledger = new BillingLedger(
      this.ledgerStore,
      this.configurationStore,
      this.liveNotificationsService,
      this.auditService,
      this.metricsService,
      this.eventEmitter,
    );
  }

  private readonly logger = new Logger(BillingService.name);

  /** Validate a tentative start without creating an externally visible billing transaction. */
  public async validateResourceUsageStart(
    resourceId: number,
    usage: BillablePriceSnapshot,
    user: { id: number },
    context?: BillingTransactionContext,
  ) {
    const resourceBillingConfiguration = await this.getResourceBillingConfiguration(resourceId, context);

    if (await this.isBillingEnabled(resourceId, context, usage)) {
      const balance = await this.getBalance(user.id, context);
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
    usage: BillablePriceSnapshot & { id: number },
    user: { id: number },
    context?: BillingTransactionContext,
  ) {
    await this.validateResourceUsageStart(resourceId, usage, user, context);

    await this.ledgerStore.insertTransaction(
      {
        userId: user.id,
        resourceUsageId: usage.id,
        amount: 0,
        status: BillingTransactionStatus.Pending,
      },
      {
        context,
        audit: (transactionId) =>
          billingTransactionAuditEvent({
            transactionId,
            userId: user.id,
            amount: 0,
            status: BillingTransactionStatus.Pending,
            source: 'resource-usage',
          }),
      },
    );
  }

  public async isBillingEnabled(
    resourceId: number,
    context?: BillingTransactionContext,
    usage?: BillablePriceSnapshot,
  ) {
    const configuration = await this.getResourceBillingConfiguration(resourceId, context);
    if (
      (usage?.creditsPerUsage ?? configuration.creditsPerUsage) > 0 ||
      (usage?.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute) > 0 ||
      (usage?.operatingDurationCreditsPerMinute ?? configuration.creditsPerOperatingMinute) > 0 ||
      (usage?.meterRates
        ? usage.meterRates.some((meter) => meter.creditsPerUnit > 0)
        : await this.configurationStore.hasPricedMeter(resourceId, context))
    ) {
      return true;
    }

    const setAdditionalItemsFlowNodes = await this.resourceFlowsService.getNodes(
      resourceId,
      ResourceFlowNodeType.OUTPUT_RESOURCE_BILLING_SET_ADDITIONAL_ITEMS,
      context,
    );
    if (setAdditionalItemsFlowNodes.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Settles the bill of an ended usage. With a caller-owned transaction the charge joins it and the caller
   * publishes it (`notifyResourceUsageCharge`) once it committed; without one the charge runs in its own unit of
   * work and is published after that committed.
   */
  public async chargeForResourceUsage(
    usage: BillableUsage,
    context?: BillingTransactionContext,
    /** The running time split among the sessions that shared the machine; sessions that never did bill by the minute. */
    operatingShare?: OperatingShare | null,
  ): Promise<BillingTransactionRecord | undefined> {
    if (context) {
      return await this.settleUsageCharge(usage, context, operatingShare);
    }

    return await this.unitOfWork.run(async (scope) => {
      const transaction = await this.settleUsageCharge(usage, scope, operatingShare);
      if (transaction) scope.afterCommit(() => this.notifyResourceUsageCharge(transaction.id));
      return transaction;
    });
  }

  private async settleUsageCharge(
    usage: BillableUsage,
    context: BillingTransactionContext,
    operatingShare?: OperatingShare | null,
  ): Promise<BillingTransactionRecord | undefined> {
    if (await this.ledgerStore.hasCompletedChargeForUsage(usage.id, context)) {
      throw new BadRequestException('Billing transaction already exists for this resource usage');
    }

    const configuration = await this.getResourceBillingConfiguration(usage.resource.id, context);

    const sessionDurationRate = usage.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute;
    const operatingDurationRate = usage.operatingDurationCreditsPerMinute ?? 0;
    const sessionDurationMs = usage.endTime ? Math.max(0, usage.endTime.getTime() - usage.startTime.getTime()) : 0;
    // Attribution originates from integer-millisecond intervals; remove only minute-storage float noise.
    const operatingDurationMs = Math.round((usage.attributedOperatingDurationInMinutes ?? 0) * 60_000);
    const roundedMinutes = Math.ceil(sessionDurationMs / 60_000);
    const roundedOperatingMinutes = Math.ceil(operatingDurationMs / 60_000);
    // Rounding a shared session's time up per person would create credit, so it is charged on exact shares.
    const sharedOperating = operatingShare?.shared ? operatingShare : null;
    // Legacy sessions have no complete snapshot; preserve their existing configuration fallback.
    const creditsForSession = usage.creditsPerUsage ?? configuration.creditsPerUsage;
    let grossCredits =
      toExactCredits(sessionDurationRate) * toExactCredits(roundedMinutes) +
      (sharedOperating
        ? toExactCredits(operatingDurationRate > 0 ? sharedOperating.credits : 0)
        : toExactCredits(operatingDurationRate) * toExactCredits(roundedOperatingMinutes)) +
      toExactCredits(creditsForSession);

    const existing = await this.ledgerStore.findUsageTransaction(usage.id, context);

    (existing?.items ?? []).forEach((item) => {
      grossCredits += toExactCredits(item.unitPrice) * toExactCredits(item.quantity);
    });

    // A session without any charge leaves no bill: its pending one goes, unless a late meter correction needs it.
    if (
      grossCredits === BigInt(0) &&
      (!existing || (await this.ledgerStore.discardPendingUsageBill(usage.id, context)))
    ) {
      return undefined;
    }

    const billingFactor = usage.billingFactor ?? usage.user.billingFactor;
    const { amount: totalCredits, discount: billingFactorDiscountAmount } = applyBillingFactor(
      grossCredits,
      billingFactor,
    );

    const items: NewBillingTransactionItem[] = [
      { name: 'PER_SESSION', unitPrice: creditsForSession, quantity: 1 },
      { name: 'PER_MINUTE', durationMs: sessionDurationMs, unitPrice: sessionDurationRate, quantity: roundedMinutes },
    ];

    if (operatingDurationRate > 0 && sharedOperating) {
      const breakdown = operatingBreakdown(sharedOperating);
      items.push(
        breakdown.length
          ? {
              name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
              durationMs: sharedOperating.shareMs,
              unitPrice: sharedOperating.credits,
              quantity: 1,
              allocation: { kind: 'operating-time' as const, segments: breakdown },
            }
          : // Without any running time there is nothing to show a share of; it reads like a solo session with none.
            {
              name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
              durationMs: 0,
              unitPrice: operatingDurationRate,
              quantity: 0,
            },
      );
    } else if (operatingDurationRate > 0) {
      items.push({
        name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
        durationMs: operatingDurationMs,
        unitPrice: operatingDurationRate,
        quantity: roundedOperatingMinutes,
      });
    }

    if (billingFactorDiscountAmount !== 0) {
      items.push({
        name: 'BILLING_FACTOR',
        description: `${billingFactor}%`,
        unitPrice: -billingFactorDiscountAmount,
        quantity: 1,
      });
    }

    return await this.ledgerStore.settleUsageCharge(
      {
        existing,
        userId: usage.userId as number,
        usageId: usage.id,
        amount: -totalCredits,
        items,
        audit: (transactionId) =>
          billingTransactionAuditEvent({
            transactionId,
            userId: existing?.userId ?? (usage.userId as number),
            amount: -totalCredits,
            status: BillingTransactionStatus.Completed,
            ...(existing ? { previousStatus: existing.status } : {}),
            source: 'resource-usage',
          }),
      },
      context,
    );
  }

  /** Publish a completed charge only after its owning usage transaction has committed. */
  async notifyResourceUsageCharge(transactionId: number): Promise<void> {
    try {
      const receipt = await this.ledgerStore.findUsageReceipt(transactionId);
      if (!receipt) return;
      const { transaction, recipient, usage } = receipt;

      bestEffortPush(
        this.liveNotificationsService.notifyTransactionUpdate(transaction),
        this.logger,
        `resource usage charge ${transactionId}`,
      );
      if (!recipient?.email || !usage || transaction.amount === 0) return;

      const configuration = await this.getConfiguration();
      await this.emailService.sendResourceUsageBillingSummaryEmail(
        recipient,
        transaction,
        usage,
        configuration.minorUnit,
      );
    } catch (error) {
      // A receipt delivery failure must not change an already committed charge.
      this.logger.warn(`Failed to publish resource usage charge ${transactionId}`, error);
    }
  }

  async getBalance(userId: number, context?: BillingTransactionContext): Promise<number> {
    return this.ledger.getBalance(userId, context);
  }

  async getTransactionIdForUsage(usageId: number, userId: number): Promise<number | null> {
    return this.ledger.getTransactionIdForUsage(usageId, userId);
  }

  async getHistory(userId: number, options: PaginationOptions): Promise<BillingTransactionPage> {
    return this.ledger.getHistory(userId, options);
  }

  async getTransaction(transactionId: number, userId?: number): Promise<BillingTransactionDetail | null> {
    return this.ledger.getTransaction(transactionId, userId);
  }

  async getResourceUsageCharge(resourceUsageId: number, userId: number): Promise<BillingTransactionRecord | null> {
    return this.ledger.getResourceUsageCharge(resourceUsageId, userId);
  }

  async createManualTransaction(
    userId: number,
    initiatorId: number,
    amount: number,
    failOnInsufficientBalance = true,
  ): Promise<BillingTransactionRecord> {
    return this.ledger.createManualTransaction(userId, initiatorId, amount, failOnInsufficientBalance);
  }

  async refundTransaction(executingUserId: number, transactionId: number, data: RefundTransactionDto) {
    return this.ledger.refundTransaction(executingUserId, transactionId, data);
  }

  async setConfiguration(nextConfigurationData: SetBillingConfigurationDto): Promise<BillingConfigurationDto> {
    return this.ledger.setConfiguration(nextConfigurationData);
  }

  async getConfiguration(): Promise<BillingConfigurationDto> {
    return this.ledger.getConfiguration();
  }

  async getResourceBillingConfiguration(
    resourceId: number,
    context?: BillingTransactionContext,
  ): Promise<ResourceBillingConfigurationRecord> {
    return this.ledger.getResourceBillingConfiguration(resourceId, context);
  }

  async updateResourceBillingConfiguration(
    resourceId: number,
    data: UpdateResourceBillingConfigurationDto,
  ): Promise<ResourceBillingConfigurationRecord> {
    return this.ledger.updateResourceBillingConfiguration(resourceId, data);
  }
}
