import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageSessionEndedEvent, ResourceUsageSessionTakenOverEvent } from './events/resource-usage.events';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { createTranslator } from '../../i18n/translate';
import * as en from './resource-session-notification.en.json';
import * as de from './resource-session-notification.de.json';

const t = createTranslator({ en, de });

@Injectable()
export class ResourceSessionNotificationListener {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @OnEvent(ResourceUsageSessionTakenOverEvent.EVENT_NAME)
  async handleTakenOver(event: ResourceUsageSessionTakenOverEvent): Promise<void> {
    const newUserUsername = event.newUser.username;
    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [event.previousUser],
      actorId: event.newUser.id,
      title: (recipient) => t(recipient.locale, 'takeoverTitle', { resourceName: event.resource.name }),
      body: (recipient) => {
        const userName = newUserUsername ?? t(recipient.locale, 'fallbackUser');
        return t(recipient.locale, 'takeoverBody', { userName });
      },
      url: `/resources/${event.resource.id}`,
      severity: 'warning',
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_TAKEOVER, {
          resource: { id: event.resource.id, name: event.resource.name },
          takeover: { actorName: newUserUsername ?? t(recipient.locale, 'fallbackUser') },
        }),
    });
  }

  @OnEvent(ResourceUsageSessionEndedEvent.EVENT_NAME)
  async handleSessionEnded(event: ResourceUsageSessionEndedEvent): Promise<void> {
    const recipient = event.usage.user;
    const resource = event.usage.resource;
    if (!recipient || !resource) {
      return;
    }

    // Only notify when someone else (or the system) ended the session — not the user themselves.
    if (event.endedBy !== null && event.endedBy.id === event.usage.userId) {
      return;
    }

    const endedByUsername = event.endedBy?.username;

    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_SESSION_ENDED,
      recipients: [recipient],
      actorId: event.endedBy?.id,
      title: (r) => t(r.locale, 'sessionEndedTitle', { resourceName: resource.name }),
      body: (r) => {
        const endedBy = endedByUsername ?? t(r.locale, 'fallbackSystem');
        return t(r.locale, 'sessionEndedBody', { endedBy });
      },
      url: `/resources/${resource.id}`,
      severity: 'warning',
      dedupeKey: `resource_session_ended:${event.usage.id}`,
      sendEmail: (r) =>
        this.notifications.sendEmailTemplate(r, NotificationCategory.RESOURCE_SESSION_ENDED, {
          resource: { id: resource.id, name: resource.name },
          session: {
            id: event.usage.id,
            endedAt: event.usage.endTime,
            endedBy: endedByUsername ?? t(r.locale, 'fallbackSystem'),
          },
        }),
    });
  }
}
