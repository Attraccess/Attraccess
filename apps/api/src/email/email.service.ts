import { Injectable, Logger } from '@nestjs/common';
import { EmailTemplateService } from '../email-template/email-template.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { User, EmailTemplateType, EmailTemplate } from '@attraccess/database-entities';
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
    private readonly mjmlService: MjmlService
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
        `Sending email to: ${user.email} using ${templateType} template with subject: ${dbTemplate.subject}`
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
      'user.username': user.username,
      'user.email': user.email,
      'user.id': user.id,
      'host.frontend': this.frontendUrl,
      'host.backend': this.configService.get<string>('app.backendUrl'),
      url: this.frontendUrl,
    };
  }

  async sendVerificationEmail(user: User, verificationToken: string) {
    const verificationUrl = `${this.frontendUrl}/verify-email?email=${encodeURIComponent(
      user.email
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
}
