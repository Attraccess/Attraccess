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
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, MoreThan } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { ResourceFlowsService } from '../resources/flows/resource-flows.service';
import { BillingUsageChargeImplementation } from './billing-usage-charge';
import { InsufficientBalanceError } from './errors/insufficient-balance.error';
import { LiveNotificationsService } from './liveNotificationsService';

@Injectable()
export class BillingService extends BillingUsageChargeImplementation {
  protected readonly logger = new Logger(BillingService.name);

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
}
