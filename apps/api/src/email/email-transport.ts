import { EmailTemplate, EmailTemplateType, User } from '@attraccess/database-entities';
import * as Handlebars from 'handlebars';
import { createTransport } from 'nodemailer';
import { EntityManager } from 'typeorm';
import { EMAIL_LOGO_CID, EMAIL_LOGO_PATH } from './email.service.route-context';
import { EmailServiceRouteContext } from './email.service.route-context';
export abstract class EmailTransportImplementation extends EmailServiceRouteContext {
  protected async convertTemplate(template: EmailTemplate, context: Record<string, unknown>, locale: string) {
    const translationsMap = await this.emailTemplateService.getTranslationsMap(template.type, locale);

    const tHelper = (key: string, defaultValue: string, options: Handlebars.HelperOptions) => {
      const safeDefault = typeof defaultValue === 'string' ? defaultValue : '';
      const raw = translationsMap[key] || safeDefault;
      const hash = options?.hash ?? {};
      const result = raw.replace(/\{(\w+(?:\.\w+)*)\}/g, (_: string, name: string) =>
        Object.hasOwn(hash, name) ? Handlebars.escapeExpression(String(hash[name] ?? '')) : `{${name}}`,
      );
      return new Handlebars.SafeString(result);
    };

    const renderOpts = { helpers: { t: tHelper } };
    const subject = Handlebars.compile(template.subject)(context, renderOpts);

    const bodyHtml = await this.emailLayoutService.renderWithTemplate(template);
    const body = Handlebars.compile(bodyHtml)(context, renderOpts);

    return { subject, body };
  }

  protected async sendEmail(
    user: User,
    templateType: EmailTemplateType,
    context: Record<string, unknown>,
    manager?: EntityManager,
  ) {
    try {
      const locale = user.locale ?? 'en';
      const dbTemplate = await this.emailTemplateService.findOne(templateType, manager);

      const { subject, body } = await this.convertTemplate(dbTemplate, context, locale);
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
          attachments: [
            {
              filename: 'logo.png',
              path: EMAIL_LOGO_PATH,
              contentType: 'image/png',
              cid: EMAIL_LOGO_CID,
            },
          ],
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

  protected async getBaseContext(user: User) {
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
        notificationPreferencesUrl: `${url}/account`,
        logoUrl: `cid:${EMAIL_LOGO_CID}`,
      },
      url,
    } as const;
  }

  async assertSmtpConfigured(): Promise<void> {
    await this.createTransporter();
  }

  protected async createTransporter(): Promise<{ transporter: ReturnType<typeof createTransport>; from: string }> {
    const smtpConfig = await this.settingsService.getSmtpConfiguration();
    if (!smtpConfig) {
      throw new Error('SMTP configuration not set');
    }

    const transportOptions = this.settingsService.buildSmtpTransportOptions(smtpConfig);
    const transporter = createTransport(transportOptions);
    return { transporter, from: smtpConfig.from ?? '' };
  }
}
