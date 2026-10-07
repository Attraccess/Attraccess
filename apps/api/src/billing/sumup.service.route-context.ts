import { BillingTransaction } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { SumUp } from '@sumup/sdk';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CronTimer } from '../metrics/instrumentation/cron/cron.helper';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { SettingsService } from '../settings/settings.service';
import { BillingService } from './billing.service';
import { LiveNotificationsService } from './liveNotificationsService';

export const SUMUP_TOPUP_TRANSACTION_PREFIX = 'sumup_topup_transaction';

export abstract class SumUpServiceRouteContext {
  protected abstract readonly billingService: BillingService;
  protected abstract getSumUp(): Promise<SumUp>;
  protected abstract getMerchantCode(): Promise<string>;
  protected abstract readonly settingsService: SettingsService;
  protected abstract readonly logger: Logger;
  protected abstract readonly externalCallTimer: ExternalCallTimer;
  protected abstract readonly billingTransactionRepository: Repository<BillingTransaction>;
  protected abstract hasPendingTransactions: boolean;
  protected abstract readonly liveNotificationsService: LiveNotificationsService;
  protected abstract readonly auditService: AuditService;
  protected abstract updateTransactionStatusBySumupServer(sumupTransactionId: string): Promise<void>;
  protected abstract readonly cronTimer: CronTimer;
}
