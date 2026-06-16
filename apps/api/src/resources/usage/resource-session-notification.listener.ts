import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceUsageTakenOverEvent } from './events/resource-usage.events';
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
      url: `/resources/${event.resource.id}/usage`,
      severity: 'warning',
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_TAKEOVER, {
          resource: { id: event.resource.id, name: event.resource.name },
          takeover: { actorName: event.newUser.username ?? 'Another user' },
        }),
    });
  }
}
