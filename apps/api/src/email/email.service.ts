import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateService } from '../email-template/email-template.service';
import { createTransport } from 'nodemailer';
import {
  User,
  EmailTemplateType,
  EmailTemplate,
  BillingTransaction,
  ResourceUsage,
  Project,
  ProjectInvitation,
  Resource,
  ResourceHealthStatus,
} from '@attraccess/database-entities';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import * as Handlebars from 'handlebars';
import { MjmlService } from '../email-template/mjml.service';
import { EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { MetricsService } from '../metrics/metrics.service';
import { ExternalCallTimer } from '../metrics/instrumentation/external/external.helper';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mjmlService: MjmlService,
    private readonly metricsService: MetricsService,
    private readonly externalCallTimer: ExternalCallTimer,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.logger.debug('Initializing EmailService');
    this.logger.debug('EmailService initialized');
  }

  private async convertTemplate(template: EmailTemplate, context: Record<string, unknown>) {
    const subjectTemplate = Handlebars.compile(template.subject);
    const subject = subjectTemplate(context);

    const bodyMjml = await this.mjmlService.validateAndConvert(template.body);
    const bodyTemplate = Handlebars.compile(bodyMjml);
    const body = bodyTemplate(context);

    return {
      subject,
      body,
    };
  }

  private async sendEmail(
    user: User,
    templateType: EmailTemplateType,
    context: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    try {
      const dbTemplate = await this.emailTemplateService.findOne(templateType, manager);

      const { subject, body } = await this.convertTemplate(dbTemplate, context);
      const { transporter, from } = await this.createTransporter();

      this.logger.debug(
        `Sending email to: ${user.email} using ${templateType} template with subject: ${dbTemplate.subject}`,
      );
      await this.externalCallTimer.time('smtp', 'send', () =>
        transporter.sendMail({
          to: user.email,
          from,
          subject,
          html: body,
        }),
      );
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
      this.metricsService.emailSentTotal.inc({ status: 'success' });
      this.logger.debug(`Email sent successfully to: ${user.email}`);
    } catch (error) {
      this.metricsService.emailSentTotal.inc({ status: 'fail' });
      this.logger.error(`Failed to send email to: ${user.email}`, error.stack);
      throw error;
    }
  }

  private async getBaseContext(user: User) {
    const url = await this.settingsService.getUrl();
    if (!url) {
      throw new Error('Application URL not configured');
    }
    return {
      user: {
        username: user.username,
        email: user.email,
        id: user.id,
      },
      host: {
        frontend: url,
        backend: url,
      },
      url,
    } as const;
  }

  async sendVerificationEmail(user: User, verificationToken: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const verificationUrl = `${url}/verify-email?email=${encodeURIComponent(user.email)}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.VERIFY_EMAIL, context);
  }

  async sendUserInvitationEmail(user: User, verificationToken: string, manager?: EntityManager) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const verificationUrl = `${url}/accept-invitation?email=${encodeURIComponent(
      user.email,
    )}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.USER_INVITATION, context, manager);
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

  async sendPasswordResetEmail(user: User, resetToken: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const resetUrl = `${url}/reset-password?userId=${user.id}&token=${encodeURIComponent(resetToken)}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: resetUrl,
    };

    await this.sendEmail(user, EmailTemplateType.RESET_PASSWORD, context);
  }

  async sendDeleteAccountConfirmationEmail(user: User, token: string) {
    const url = await this.settingsService.getUrl();
    if (!url) throw new Error('Application URL not configured');
    const confirmUrl = `${url}/confirm-delete-account?email=${encodeURIComponent(
      user.email,
    )}&token=${encodeURIComponent(token)}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: confirmUrl,
    };

    await this.sendEmail(user, EmailTemplateType.DELETE_ACCOUNT_CONFIRMATION, context);
  }

  async sendUsernameChangedEmail(user: User, previousUsername: string) {
    const base = (await this.getBaseContext(user)) as unknown as {
      user: { username: string; email: string; id: number };
      host: { frontend: string; backend: string };
      url: string;
    };

    const context = {
      ...base,
      user: {
        ...base.user,
        previousUsername,
        newUsername: user.username,
      },
    };

    await this.sendEmail(user, EmailTemplateType.USERNAME_CHANGED, context);
  }

  async sendPasswordChangedEmail(user: User) {
    const context = await this.getBaseContext(user);
    await this.sendEmail(user, EmailTemplateType.PASSWORD_CHANGED, context);
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

    const roundedMinutes = Math.ceil(usage.usageInMinutes ?? 0);

    const items = (transaction.items ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: dbCurrencyToUserCurrency(item.unitPrice, currencyMinorUnit),
      total: dbCurrencyToUserCurrency(item.unitPrice * item.quantity, currencyMinorUnit),
    }));

    const totalCredits = dbCurrencyToUserCurrency(-transaction.amount, currencyMinorUnit); // transaction.amount is negative when charging user

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
      },
      items,
      totalCredits,
      newBalance: dbCurrencyToUserCurrency(user.creditBalance, currencyMinorUnit), // already updated by DB triggers for completed tx
    };

    await this.sendEmail(user, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, context);
  }

  async sendResourceHealthChangedEmail(
    user: User,
    resource: Pick<Resource, 'id' | 'name'>,
    change: {
      status: ResourceHealthStatus;
      previousStatus: ResourceHealthStatus | null;
      reason: string | null;
      identifier: string;
    },
  ) {
    if (!user?.email) {
      return;
    }

    const base = await this.getBaseContext(user);
    const becameUnhealthy = change.status === ResourceHealthStatus.UNHEALTHY;
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      health: {
        status: change.status,
        previousStatus: change.previousStatus ?? 'unknown',
        reason: change.reason,
        identifier: change.identifier,
        headline: becameUnhealthy ? `Resource degraded: ${resource.name}` : `Resource recovered: ${resource.name}`,
        headerColor: becameUnhealthy ? '#B91C1C' : '#047857',
        bodyAction: becameUnhealthy ? 'has become degraded' : 'is healthy again',
      },
    };

    await this.sendEmail(user, EmailTemplateType.RESOURCE_HEALTH_CHANGED, context);
  }

  async sendUserRetrainingEmail(
    user: User,
    target: { id: number; name: string; isGroup: boolean },
    info: { reason: 'age' | 'inactivity' | null; blocksAccess: boolean },
  ) {
    if (!user?.email) {
      return;
    }

    const base = await this.getBaseContext(user);
    const path = target.isGroup ? 'resource-groups' : 'resources';
    const resourceUrl = `${base.host.frontend}/${path}/${target.id}`;

    const reasonText =
      info.reason === 'age'
        ? 'Your training has reached its maximum age and must be renewed.'
        : info.reason === 'inactivity'
          ? 'You have not used this resource for the configured period and must be retrained.'
          : 'Your training must be renewed.';

    const context = {
      ...base,
      resource: {
        id: target.id,
        name: target.name,
        url: resourceUrl,
      },
      retraining: {
        reason: reasonText,
        blocksAccess: info.blocksAccess,
      },
    };

    await this.sendEmail(user, EmailTemplateType.USER_RETRAINING_REQUIRED, context);
  }

  async sendMaintenanceRequestedEmail(
    recipient: User,
    resource: Pick<Resource, 'id' | 'name'>,
    request: { id: number; reason: string; requestedBy: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      request: {
        id: request.id,
        reason: request.reason,
        requestedBy: request.requestedBy,
      },
    };

    await this.sendEmail(recipient, EmailTemplateType.MAINTENANCE_REQUEST_CREATED, context);
  }

  async sendResourceUsageNoteEmail(
    recipient: User,
    resource: Pick<Resource, 'id' | 'name'>,
    note: { content: string; phase: 'start' | 'end'; authorName: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;
    const phaseAction = note.phase === 'start' ? 'starting' : 'finishing';

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      note: {
        content: note.content,
        phase: note.phase,
        phaseAction,
        authorName: note.authorName,
      },
    };

    await this.sendEmail(recipient, EmailTemplateType.RESOURCE_USAGE_NOTE_ADDED, context);
  }

  async sendResourceTakeoverEmail(
    recipient: User,
    resource: Pick<Resource, 'id' | 'name'>,
    takeover: { actorName: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      takeover,
    };

    await this.sendEmail(recipient, EmailTemplateType.RESOURCE_TAKEOVER, context);
  }

  async sendAccessChangeEmail(
    recipient: User,
    accessChange: { title: string; body: string; url?: string },
  ) {
    const resolvedRecipient = recipient?.email
      ? recipient
      : await this.userRepository.findOne({ where: { id: recipient.id } });

    if (!resolvedRecipient?.email) {
      return;
    }

    const base = await this.getBaseContext(resolvedRecipient);
    const url = accessChange.url
      ? new URL(accessChange.url, base.host.frontend).toString()
      : undefined;

    const context = {
      ...base,
      accessChange: {
        title: accessChange.title,
        body: accessChange.body,
        url,
      },
    };

    await this.sendEmail(resolvedRecipient, EmailTemplateType.ACCESS_CHANGE, context);
  }

  async sendNewMessageEmail(
    recipient: User,
    message: { conversationId: number; senderName: string; preview: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const conversationUrl = `${base.host.frontend}/messages?conversation=${message.conversationId}`;
    const preview = message.preview.length > 200 ? `${message.preview.slice(0, 200).trimEnd()}…` : message.preview;

    const context = {
      ...base,
      message: {
        senderName: message.senderName,
        preview,
        conversationUrl,
      },
    };

    await this.sendEmail(recipient, EmailTemplateType.MESSAGE_RECEIVED, context);
  }

  async sendResourceSessionEndedEmail(
    recipient: User,
    resource: Pick<Resource, 'id' | 'name'>,
    session: { id: number; endedAt: Date | string | null; endedBy: string },
  ) {
    if (!recipient?.email) {
      return;
    }

    const base = await this.getBaseContext(recipient);
    const resourceUrl = `${base.host.frontend}/resources/${resource.id}`;

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      session: {
        id: session.id,
        endedAt: session.endedAt instanceof Date ? session.endedAt.toISOString() : session.endedAt,
        endedBy: session.endedBy,
      },
    };

    await this.sendEmail(recipient, EmailTemplateType.RESOURCE_SESSION_ENDED, context);
  }

  private async createTransporter(): Promise<{ transporter: ReturnType<typeof createTransport>; from: string }> {
    const smtpConfig = await this.settingsService.getSmtpConfiguration();
    if (!smtpConfig) {
      throw new Error('SMTP configuration not set');
    }

    const transportOptions = this.settingsService.buildSmtpTransportOptions(smtpConfig);
    const transporter = createTransport(transportOptions);
    return { transporter, from: smtpConfig.from ?? '' };
  }
}
