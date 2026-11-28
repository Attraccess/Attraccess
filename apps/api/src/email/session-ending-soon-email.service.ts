import type { NotificationRecipient } from '@attraccess/application-models';
import { Injectable } from '@nestjs/common';
import { EmailTemplateType } from '@attraccess/application-models';
import { EmailService } from './email.service';

/** The "your session ends soon" email (ATT-43). */
@Injectable()
export class SessionEndingSoonEmailService {
  constructor(private readonly emailService: EmailService) {}

  async send(
    recipient: NotificationRecipient,
    resource: { id: number; name: string },
    session: { id: number; endsAt: Date | string; minutesLeft: number },
  ) {
    if (!recipient?.email) return;
    const base = await this.emailService.getBaseContext(recipient);
    await this.emailService.sendEmail(recipient, EmailTemplateType.RESOURCE_SESSION_ENDING_SOON, {
      ...base,
      resource: { id: resource.id, name: resource.name, url: `${base.host.frontend}/resources/${resource.id}` },
      session: {
        id: session.id,
        endsAt: session.endsAt instanceof Date ? session.endsAt.toISOString() : session.endsAt,
        minutesLeft: session.minutesLeft,
      },
    });
  }
}
