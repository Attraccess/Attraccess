import {
  BillingTransaction,
  BillingTransactionItem,
  ResourceBillingConfiguration,
  Setting,
  User,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../email/email.service';
import { MetricsService } from '../metrics/metrics.service';
import { BillingConfigurationDto } from './dto/configuration.dto';
import { LiveNotificationsService } from './liveNotificationsService';

export abstract class BillingServiceRouteContext {
  protected abstract readonly settingRepository: Repository<Setting>;
  public abstract getConfiguration(): Promise<BillingConfigurationDto>;
  protected abstract readonly userRepository: Repository<User>;
  protected abstract readonly billingTransactionRepository: Repository<BillingTransaction>;
  protected abstract DEFAULT_RELATIONS: string[];
  protected abstract readonly liveNotificationsService: LiveNotificationsService;
  protected abstract readonly auditService: AuditService;
  protected abstract readonly metricsService: MetricsService;
  protected abstract readonly resourceBillingConfigurationRepository: Repository<ResourceBillingConfiguration>;
  protected abstract readonly eventEmitter: EventEmitter2;
  public abstract getResourceBillingConfiguration(
    resourceId: number,
    transactionManager?: EntityManager,
  ): Promise<ResourceBillingConfiguration>;
  protected abstract readonly billingTransactionItemRepository: Repository<BillingTransactionItem>;
  public abstract notifyResourceUsageCharge(transactionId: number): Promise<void>;
  protected abstract readonly emailService: EmailService;
  protected abstract readonly logger: Logger;
  public abstract getTransaction(transactionId: number, userId?: number): Promise<BillingTransaction>;
}
