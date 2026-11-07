import { User } from '@attraccess/database-entities';
import { Injectable } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import { EmailService } from './email.service';

export interface PluginEmailContent {
  subject: string;
  html?: string;
  text: string;
}

const CONTENT_MJML = `<mj-section><mj-column><mj-text>{{{pluginContent}}}</mj-text></mj-column></mj-section>`;

/**
 * Sends plugin-authored emails inside the global email layout. Plugin content never goes through the
 * template engine as source: it is injected as a value, so `{{` in plugin text stays literal.
 */
@Injectable()
export class PluginEmailService extends EmailService {
  public async sendPluginEmail(recipient: User, content: PluginEmailContent): Promise<void> {
    const user = recipient?.email
      ? recipient
      : await this.userRepository.findOne({ where: { id: recipient.id } });
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
