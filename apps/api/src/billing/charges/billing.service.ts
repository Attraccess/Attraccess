import {
  BillingTransaction,
  BillingTransactionItem,
  BillingTransactionStatus,
  ResourceBillingConfiguration,
  ResourceFlowNodeType,
  ResourceUsage,
  Setting,
  User,
  ResourceMeter,
} from '@attraccess/database-entities';

import { Inject, Injectable, Logger, BadRequestException } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, Repository, MoreThan } from 'typeorm';

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
    @InjectRepository(BillingTransaction)
    protected readonly billingTransactionRepository: Repository<BillingTransaction>,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
    @InjectRepository(ResourceBillingConfiguration)
    protected readonly resourceBillingConfigurationRepository: Repository<ResourceBillingConfiguration>,
    protected readonly liveNotificationsService: LiveNotificationsService,
    @InjectRepository(Setting)
    protected readonly settingRepository: Repository<Setting>,
    @InjectRepository(BillingTransactionItem)
    protected readonly billingTransactionItemRepository: Repository<BillingTransactionItem>,
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

  protected DEFAULT_RELATIONS = ['initiator', 'resourceUsage', 'resourceUsage.resource', 'refundOf', 'items'];

  /** Validate a tentative start without creating an externally visible billing transaction. */
  public async validateResourceUsageStart(
    resourceId: number,
    usage: ResourceUsage,
    user: User,
    transactionalEntityManager?: EntityManager,
  ) {
    const resourceBillingConfiguration = await this.getResourceBillingConfiguration(
      resourceId,
      transactionalEntityManager,
    );

    if (await this.isBillingEnabled(resourceId, transactionalEntityManager, usage)) {
      const balance = await this.getBalance(user.id, transactionalEntityManager);
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
    transactionalEntityManager?: EntityManager,
  ) {
    await this.validateResourceUsageStart(resourceId, usage, user, transactionalEntityManager);

    const transactionRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(BillingTransaction)
      : this.billingTransactionRepository;

    const transaction = await transactionRepository.save({
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
      transactionalEntityManager,
    );
  }

  public async isBillingEnabled(resourceId: number, transactionalEntityManager?: EntityManager, usage?: ResourceUsage) {
    const configuration = await this.getResourceBillingConfiguration(resourceId, transactionalEntityManager);
    if (
      (usage?.creditsPerUsage ?? configuration.creditsPerUsage) > 0 ||
      (usage?.sessionDurationCreditsPerMinute ?? configuration.creditsPerMinute) > 0 ||
      (usage?.operatingDurationCreditsPerMinute ?? configuration.creditsPerOperatingMinute) > 0 ||
      (usage?.meterRates
        ? usage.meterRates.some((meter) => meter.creditsPerUnit > 0)
        : (await (transactionalEntityManager ?? this.resourceBillingConfigurationRepository.manager).count(
            ResourceMeter,
            { where: { resourceId, creditsPerUnit: MoreThan(0) } },
          )) > 0)
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
    transactionManager?: EntityManager,
  ): Promise<BillingTransaction> {
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

      let transaction = await manager.findOne(BillingTransaction, {
        where: {
          resourceUsageId: usage.id,
        },
        relations: ['items'],
      });

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
        await manager.update(BillingTransaction, transaction.id, {
          amount: -totalCredits,
          status: BillingTransactionStatus.Completed,
        });

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
          manager,
        );
      } else {
        transaction = await manager.save(BillingTransaction, {
          userId: usage.userId,
          resourceUsageId: usage.id,
          amount: -totalCredits,
          status: BillingTransactionStatus.Completed,
        } as Partial<BillingTransaction>);
        void this.auditService.recordBillingTransactionAfterCommit(
          {
            transactionId: transaction.id,
            userId: transaction.userId,
            amount: transaction.amount,
            status: transaction.status,
            source: 'resource-usage',
          },
          manager,
        );
      }

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_SESSION',
        unitPrice: creditsForSession,
        quantity: 1,
      });

      await manager.save(BillingTransactionItem, {
        billingTransactionId: transaction.id,
        name: 'PER_MINUTE',
        durationMs: sessionDurationMs,
        unitPrice: sessionDurationRate,
        quantity: roundedMinutes,
      });

      if (operatingDurationRate > 0) {
        await manager.save(BillingTransactionItem, {
          billingTransactionId: transaction.id,
          name: 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
          durationMs: operatingDurationMs,
          unitPrice: operatingDurationRate,
          quantity: roundedOperatingMinutes,
        });
      }

      if (billingFactorDiscountAmount !== 0) {
        await manager.save(BillingTransactionItem, {
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

    const transaction = await this.billingTransactionItemRepository.manager.transaction((transactionalEntityManager) =>
      doCalculation(transactionalEntityManager),
    );
    if (transaction) await this.notifyResourceUsageCharge(transaction.id);
    return transaction;
  }

  /** Publish a completed charge only after its owning usage transaction has committed. */
  async notifyResourceUsageCharge(transactionId: number): Promise<void> {
    try {
      const transaction = await this.billingTransactionRepository.findOne({
        where: { id: transactionId, status: BillingTransactionStatus.Completed },
        relations: ['items', 'user', 'resourceUsage', 'resourceUsage.resource', 'resourceUsage.user'],
      });
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
