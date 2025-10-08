import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateService } from '../email-template/email-template.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import {
  User,
  EmailTemplateType,
  EmailTemplate,
  BillingTransaction,
  ResourceUsage,
} from '@attraccess/database-entities';
import { dbCurrencyToUserCurrency } from '@attraccess/shared';
import * as Handlebars from 'handlebars';
import { MjmlService } from '../email-template/mjml.service';
import { AppConfigType } from '../config/app.config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl: string;
  private readonly backendUrl: string;

  constructor(
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly mjmlService: MjmlService,
  ) {
    this.logger.debug('Initializing EmailService');

    const appConfig = this.configService.get<AppConfigType>('app');

    this.frontendUrl = appConfig.ATTRACCESS_FRONTEND_URL;
    this.backendUrl = appConfig.ATTRACCESS_URL;

    this.logger.debug(`EmailService initialized with ATTRACCESS_FRONTEND_URL: ${this.frontendUrl}`);
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

  private async sendEmail(user: User, templateType: EmailTemplateType, context: Record<string, unknown>) {
    try {
      const dbTemplate = await this.emailTemplateService.findOne(templateType);

      const { subject, body } = this.convertTemplate(dbTemplate, context);

      this.logger.debug(
        `Sending email to: ${user.email} using ${templateType} template with subject: ${dbTemplate.subject}`,
      );
      await this.mailerService.sendMail({
        to: user.email,
        subject,
        html: body,
      });
      this.logger.debug(`Email sent successfully to: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to send email to: ${user.email}`, error.stack);
      throw error;
    }
  }

  private getBaseContext(user: User) {
    return {
      user: {
        username: user.username,
        email: user.email,
        id: user.id,
      },
      host: {
        frontend: this.frontendUrl,
        backend: this.backendUrl,
      },
      url: this.frontendUrl,
    } as const;
  }

  async sendVerificationEmail(user: User, verificationToken: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?email=${encodeURIComponent(
      user.email,
    )}&token=${verificationToken}`;

    const context = {
      ...this.getBaseContext(user),
      url: verificationUrl,
    };

    await this.sendEmail(user, EmailTemplateType.VERIFY_EMAIL, context);
  }

  async sendPasswordResetEmail(user: User, resetToken: string) {
    const resetUrl = `${this.frontendUrl}/reset-password?userId=${user.id}&token=${encodeURIComponent(resetToken)}`;

    const context = {
      ...this.getBaseContext(user),
      url: resetUrl,
    };

    await this.sendEmail(user, EmailTemplateType.RESET_PASSWORD, context);
  }

  async sendUsernameChangedEmail(user: User, previousUsername: string) {
    const base = this.getBaseContext(user) as unknown as {
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
    const context = this.getBaseContext(user);
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

    const totalFromItems = items.reduce((sum, it) => sum + it.total, 0);
    const totalCredits = dbCurrencyToUserCurrency(-transaction.amount, currencyMinorUnit); // transaction.amount is negative when charging user
    const discount = totalFromItems - totalCredits;

    const context = {
      ...this.getBaseContext(user),
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
      discount,
      totalCredits,
      newBalance: dbCurrencyToUserCurrency(user.creditBalance, currencyMinorUnit), // already updated by DB triggers for completed tx
    };

    await this.sendEmail(user, EmailTemplateType.RESOURCE_USAGE_BILLING_TRANSACTION_SUMMARY, context);
  }
}
