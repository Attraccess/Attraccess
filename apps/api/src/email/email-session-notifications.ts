import { EmailTemplateType, Resource, User } from '@attraccess/database-entities';
import { EmailResourceNotificationsImplementation } from './email-resource-notifications';
export abstract class EmailSessionNotificationsImplementation extends EmailResourceNotificationsImplementation {
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

    const context = {
      ...base,
      resource: {
        id: resource.id,
        name: resource.name,
        url: resourceUrl,
      },
      note: {
        content: note.content,
        isStart: note.phase === 'start',
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

  async sendNewMessageEmail(recipient: User, message: { conversationId: number; senderName: string; preview: string }) {
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
}
