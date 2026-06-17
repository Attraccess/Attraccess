import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceSessionEndedEvent, ResourceUsageTakenOverEvent } from './events/resource-usage.events';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

@Injectable()
export class ResourceSessionNotificationListener {
  constructor(private readonly notifications: NotificationDispatchService) {}

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  async handleTakenOver(event: ResourceUsageTakenOverEvent): Promise<void> {
    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_TAKEOVER,
      recipients: [event.previousUser],
      actorId: event.newUser.id,
      title: `${event.resource.name} was taken over`,
      body: `${event.newUser.username ?? 'Another user'} took over your active resource session.`,
      url: `/resources/${event.resource.id}`,
      severity: 'warning',
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_TAKEOVER, {
          resource: { id: event.resource.id, name: event.resource.name },
          takeover: { actorName: event.newUser.username ?? 'Another user' },
        }),
    });
  }

  @OnEvent(ResourceSessionEndedEvent.EVENT_NAME)
  async handleSessionEnded(event: ResourceSessionEndedEvent): Promise<void> {
    const recipient = event.usage.user;
    const resource = event.usage.resource;
    if (!recipient || !resource) {
      return;
    }

    // Only notify when someone else (or the system) ended the session — not the user themselves.
    if (event.endedBy !== null && event.endedBy.id === event.usage.userId) {
      return;
    }

    const endedBy = event.endedBy?.username ?? 'The system';

    await this.notifications.dispatch({
      category: NotificationCategory.RESOURCE_SESSION_ENDED,
      recipients: [recipient],
      actorId: event.endedBy?.id,
      title: `${resource.name} session ended`,
      body: `${endedBy} ended your active resource session.`,
      url: `/resources/${resource.id}`,
      severity: 'warning',
      dedupeKey: `resource_session_ended:${event.usage.id}`,
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_SESSION_ENDED, {
          resource: { id: resource.id, name: resource.name },
          session: { id: event.usage.id, endedAt: event.usage.endTime, endedBy },
        }),
    });
  }
}
