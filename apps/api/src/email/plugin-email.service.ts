import { User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { EmailService } from './email.service';
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
export class PluginEmailService extends EmailService {
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
    if (!getPluginEmailTemplate(key)) {
      throw new Error(
        `Plugin "${pluginName}" sent undeclared email template "${templateId}". ` +
          'Declare it in emailTemplates of the plugin backend module.',
      );
    }
    const user = recipient?.email ? recipient : await this.userRepository.findOne({ where: { id: recipient.id } });
    if (!user?.email) return;
    await this.sendEmail(user, key, { ...variables, ...(await this.getBaseContext(user)) });
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
      const html = Handlebars.compile(layoutHtml)({ ...(await this.getBaseContext(user)), pluginContent });
      await this.deliverEmail(user, content.subject, html, content.text);
      this.metricsService.emailSentTotal.inc({ status: 'success' });
    } catch (error) {
      this.metricsService.emailSentTotal.inc({ status: 'fail' });
      this.logger.error(`Failed to send plugin email to: ${user.email}`, (error as Error).stack);
      throw error;
    }
  }
}
