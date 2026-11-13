import { User } from '@attraccess/database-entities';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Handlebars from 'handlebars';
import { EmailService } from './email.service';
import { EmailLayoutService } from '../email-layout/email-layout.service';
import { MetricsService } from '../metrics/metrics.service';
import { getPluginEmailTemplate, pluginEmailTemplateKey } from '../email-template/plugin-email-templates';

export interface PluginEmailContent {
  subject: string;
  html?: string;
  text: string;
}

const CONTENT_MJML = `<mj-section><mj-column><mj-text>{{{pluginContent}}}</mj-text></mj-column></mj-section>`;

/**
 * Sends plugin emails inside the global email layout: from an admin-editable template the plugin declared
 * ({@link sendPluginTemplate}), or from raw content ({@link sendPluginEmail}). Raw plugin content never goes
 * through the template engine as source: it is injected as a value, so `{{` in plugin text stays literal.
 */
@Injectable()
export class PluginEmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly emailLayoutService: EmailLayoutService,
    private readonly metricsService: MetricsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Renders the stored template `plugin.<pluginName>.<id>` (the admin's edits included) in the recipient's
   * language and sends it. `variables` sit next to the host's `user`, `host` and `url`, which they cannot replace.
   */
  public async sendPluginTemplate(
    pluginName: string,
    recipient: User,
    templateId: string,
    variables: Record<string, unknown>,
  ): Promise<void> {
    const key = pluginEmailTemplateKey(pluginName, templateId);
    // Plugin names may contain ".", so the key alone could name a template of plugin "<this>.<x>".
    if (getPluginEmailTemplate(key)?.pluginName !== pluginName) {
      throw new Error(
        `Plugin "${pluginName}" sent undeclared email template "${templateId}". ` +
          'Declare it in emailTemplates of the plugin backend module.',
      );
    }
    const user = recipient?.email ? recipient : await this.userRepository.findOne({ where: { id: recipient.id } });
    if (!user?.email) return;
    await this.emailService.sendEmail(user, key, { ...variables, ...(await this.emailService.getBaseContext(user)) });
  }

  public async sendPluginEmail(recipient: User, content: PluginEmailContent): Promise<void> {
    const user = recipient?.email ? recipient : await this.userRepository.findOne({ where: { id: recipient.id } });
    if (!user?.email) return;

    try {
      const layoutHtml = await this.emailLayoutService.renderWithTemplate({ body: CONTENT_MJML });
      const pluginContent =
        content.html ??
        content.text
          .split(/\n{2,}/)
          .map((paragraph) => `<p>${Handlebars.escapeExpression(paragraph).replace(/\n/g, '<br>')}</p>`)
          .join('');
      const html = Handlebars.compile(layoutHtml)({ ...(await this.emailService.getBaseContext(user)), pluginContent });
      await this.emailService.deliverEmail(user, content.subject, html, content.text);
      this.metricsService.emailSentTotal.inc({ status: 'success' });
    } catch (error) {
      this.metricsService.emailSentTotal.inc({ status: 'fail' });
      this.logger.error(`Failed to send plugin email to: ${user.email}`, (error as Error).stack);
      throw error;
    }
  }
}
