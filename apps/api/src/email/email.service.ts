import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateService } from '../email-template/email-template.service';
import { createTransport } from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  User,
  EmailTemplateType,
  EmailTemplate,
  BillingTransaction,
  ResourceUsage,
  Project,
  ProjectInvitation,
} from '@attraccess/database-entities';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import * as Handlebars from 'handlebars';
import { MjmlService } from '../email-template/mjml.service';
import { EntityManager } from 'typeorm';
import { SettingsService } from '../settings/settings.service';
import { SmtpServiceType } from '../settings/dto/smtp-settings.dto';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mjmlService: MjmlService,
  ) {
    this.logger.debug('Initializing EmailService');
    this.logger.debug('EmailService initialized');
  }

  private convertTemplate(template: EmailTemplate, context: Record<string, unknown>) {
    const subjectTemplate = Handlebars.compile(template.subject);
    const subject = subjectTemplate(context);

    const bodyMjml = this.mjmlService.validateAndConvert(template.body);
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

      const { subject, body } = this.convertTemplate(dbTemplate, context);
      const { transporter, from } = await this.createTransporter();

      this.logger.debug(
        `Sending email to: ${user.email} using ${templateType} template with subject: ${dbTemplate.subject}`,
      );
      await transporter.sendMail({
        to: user.email,
        from,
        subject,
        html: body,
      });
      if (typeof transporter.close === 'function') {
        transporter.close();
      }
      this.logger.debug(`Email sent successfully to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to: ${user.email}`, error.stack);
      throw error;
    }
  }

  private async getBaseContext(user: User) {
    const { frontendUrl, backendUrl } = await this.getUrls();
    return {
      user: {
        username: user.username,
        email: user.email,
        id: user.id,
      },
      host: {
        frontend: frontendUrl,
        backend: backendUrl,
      },
      url: frontendUrl,
    } as const;
  }

  async sendVerificationEmail(user: User, verificationToken: string) {
    const { frontendUrl } = await this.getUrls();
    const verificationUrl = `${frontendUrl}/verify-email?email=${encodeURIComponent(
      user.email,
    )}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.VERIFY_EMAIL, context);
  }

  async sendUserInvitationEmail(user: User, verificationToken: string, manager?: EntityManager) {
    const { frontendUrl } = await this.getUrls();
    const verificationUrl = `${frontendUrl}/accept-invitation?email=${encodeURIComponent(
      user.email,
    )}&token=${verificationToken}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.USER_INVITATION, context, manager);
  }

  async sendProjectInvitationEmail(invitedUser: User, project: Project, invitation: ProjectInvitation) {
    const { frontendUrl } = await this.getUrls();
    const invitationUrl = `${frontendUrl}/projects?invitationId=${invitation.id}`;

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
    const { frontendUrl } = await this.getUrls();
    const resetUrl = `${frontendUrl}/reset-password?userId=${user.id}&token=${encodeURIComponent(resetToken)}`;

    const context = {
      ...(await this.getBaseContext(user)),
      url: resetUrl,
    };

    await this.sendEmail(user, EmailTemplateType.RESET_PASSWORD, context);
  }

  async sendDeleteAccountConfirmationEmail(user: User, token: string) {
    const { frontendUrl } = await this.getUrls();
    const confirmUrl = `${frontendUrl}/confirm-delete-account?email=${encodeURIComponent(
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

  private async getUrls(): Promise<{ frontendUrl: string; backendUrl: string }> {
    const [frontendUrl, backendUrl] = await Promise.all([
      this.settingsService.getFrontendUrl(),
      this.settingsService.getBackendUrl(),
    ]);

    if (!frontendUrl) {
      throw new Error('Frontend URL not configured');
    }
    if (!backendUrl) {
      throw new Error('Backend URL not configured');
    }

    return { frontendUrl, backendUrl };
  }

  private async createTransporter(): Promise<{ transporter: ReturnType<typeof createTransport>; from: string }> {
    const smtpConfig = await this.settingsService.getSmtpConfiguration();
    if (!smtpConfig) {
      throw new Error('SMTP configuration not set');
    }

    let transportOptions: SMTPTransport.Options;

    if (smtpConfig.service === SmtpServiceType.Outlook365) {
      transportOptions = {
        service: 'Outlook365',
        auth: smtpConfig.user || smtpConfig.pass ? { user: smtpConfig.user ?? '', pass: smtpConfig.pass ?? '' } : undefined,
      };
    } else {
      transportOptions = {
        host: smtpConfig.host ?? undefined,
        port: smtpConfig.port ?? undefined,
        secure: smtpConfig.secure ?? false,
        auth: smtpConfig.user || smtpConfig.pass ? { user: smtpConfig.user ?? '', pass: smtpConfig.pass ?? '' } : undefined,
      };
    }

    const transporter = createTransport(transportOptions);
    return { transporter, from: smtpConfig.from ?? '' };
  }
}
