import {
  BillingTransaction,
  EmailTemplateType,
  Project,
  ProjectInvitation,
  ResourceUsage,
  User,
} from '@attraccess/database-entities';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { MetricsService } from '../metrics/metrics.service';
import { formatKwh } from '../resources/metering/energy';
import { SettingsService } from '../settings/settings.service';
import { EmailSessionNotificationsImplementation } from './email-session-notifications';

@Injectable()
export class EmailService extends EmailSessionNotificationsImplementation {
  protected readonly logger = new Logger(EmailService.name);

  constructor(
    protected readonly settingsService: SettingsService,
    protected readonly emailTemplateService: EmailTemplateService,
    protected readonly emailLayoutService: EmailLayoutService,
    protected readonly metricsService: MetricsService,
    protected readonly externalCallTimer: ExternalCallTimer,
    @InjectRepository(User)
    protected readonly userRepository: Repository<User>,
  ) {
    super();
    this.logger.debug('Initializing EmailService');
    this.logger.debug('EmailService initialized');
  }

  async sendProjectInvitationEmail(invitedUser: User, project: Project, invitation: ProjectInvitation) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const invitationUrl = `${url}/projects?invitationId=${invitation.id}`;

    const context = {
      ...(await this.getBaseContext(invitedUser)),
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      inviter: {
        username: invitation.inviter?.username,
        email: invitation.inviter?.email,
      },
      invitation: {
        id: invitation.id,
        role: invitation.requestedRole,
      },
      invitationUrl,
    };

    await this.sendEmail(invitedUser, EmailTemplateType.PROJECT_INVITATION, context);
  }

  async sendResourceUsageBillingSummaryEmail(
    user: User,
    transaction: BillingTransaction,
    usage: ResourceUsage,
    currencyMinorUnit: number,
  ) {
    if (!user?.email) {
      return;
    }

    // Receipts describe the settled transaction, including its original rounding.
    const roundedMinutes = transaction.items?.find((item) => item.name === 'PER_MINUTE')?.quantity;
    const secondsFormatOptions = { maximumFractionDigits: 3 };
    let secondsFormatter: Intl.NumberFormat;
    try {
      secondsFormatter = new Intl.NumberFormat(user.locale ?? 'en', secondsFormatOptions);
    } catch {
      // Persisted locales are not restricted to valid Intl tags. Match the default email language.
      secondsFormatter = new Intl.NumberFormat('en', secondsFormatOptions);
    }

    const items = (transaction.items ?? []).map((item) => ({
      name: item.name,
      description: item.description,
      isEnergy: item.name === 'ENERGY',
      energyKwh: item.energyMicroWh == null ? undefined : formatKwh(BigInt(item.energyMicroWh)),
      quantity: item.quantity,
      unitPrice: dbCurrencyToUserCurrency(item.unitPrice, currencyMinorUnit),
      total: dbCurrencyToUserCurrency(item.unitPrice * item.quantity, currencyMinorUnit),
      isFixedFee: item.name === 'PER_SESSION',
      isSessionDuration: item.name === 'PER_MINUTE',
      isOperatingDuration: item.name === 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
      isBillingFactor: item.name === 'BILLING_FACTOR',
      isDuration: item.name === 'PER_MINUTE' || item.name === 'PER_ATTRIBUTABLE_OPERATING_MINUTE',
      durationMs: item.durationMs,
      hasDuration: item.durationMs != null,
      durationSeconds: item.durationMs == null ? undefined : secondsFormatter.format(item.durationMs / 1000),
    }));

    const totalCredits = dbCurrencyToUserCurrency(-transaction.amount, currencyMinorUnit);

    const context = {
      ...(await this.getBaseContext(user)),
      resource: {
        id: usage.resource.id,
        name: usage.resource.name,
      },
      usage: {
        startTime: usage.startTime?.toISOString?.() ?? usage.startTime,
        endTime: usage.endTime?.toISOString?.() ?? usage.endTime,
        roundedMinutes,
        billingFactor: usage.billingFactor == null ? undefined : `${usage.billingFactor}%`,
      },
      items,
      totalCredits,
      newBalance: dbCurrencyToUserCurrency(user.creditBalance, currencyMinorUnit),
    };

    await this.sendEmail(user, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, context);
  }
}
