// Sends emails to maintainers and admins when a resource health state transitions
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceHealthStatus, type ResourceNotificationRecipient } from '@attraccess/application-models';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { RESOURCE_RECIPIENT_STORE, type ResourceRecipientStore } from './resource-health-store.port';
import { createTranslator } from '../../i18n/translate';
import * as en from './resource-health-notification.en.json';
import * as de from './resource-health-notification.de.json';

const t = createTranslator({ en, de });

type DispatchRecipient = Parameters<NotificationDispatchService['dispatch']>[0]['recipients'][number];

/** The dispatcher reads the id, the address and the locale of a recipient, which the recipient model carries. */
const asDispatchRecipient = (recipient: ResourceNotificationRecipient): DispatchRecipient =>
  recipient as unknown as DispatchRecipient;

@Injectable()
export class ResourceHealthNotificationListener {
  private readonly logger = new Logger(ResourceHealthNotificationListener.name);

  constructor(
    @Inject(RESOURCE_RECIPIENT_STORE)
    private readonly recipientStore: ResourceRecipientStore,
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
  ) {}

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  async handleHealthChanged(event: ResourceHealthChangedEvent): Promise<void> {
    if (event.previousStatus === null && event.status === ResourceHealthStatus.HEALTHY) {
      return;
    }

    try {
      const resource = await this.recipientStore.findResource(event.resourceId);
      if (!resource) {
        this.logger.warn(`Health event for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource);
      if (recipients.length === 0) {
        return;
      }

      const becameUnhealthy = event.status === ResourceHealthStatus.UNHEALTHY;
      await this.notifications.dispatch({
        category: NotificationCategory.RESOURCE_HEALTH,
        recipients: recipients.map(asDispatchRecipient),
        title: (recipient) =>
          t(recipient.locale, becameUnhealthy ? 'titleDegraded' : 'titleRecovered', { resourceName: resource.name }),
        body: (recipient) =>
          event.reason ??
          t(recipient.locale, 'bodyStatusChanged', {
            resourceName: resource.name,
            previousStatus: event.previousStatus ?? t(recipient.locale, 'statusUnknown'),
            status: event.status,
          }),
        url: `/resources/${resource.id}`,
        severity: becameUnhealthy ? 'warning' : 'info',
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_HEALTH, {
            resource: { id: resource.id, name: resource.name },
            health: {
              status: event.status,
              previousStatus: event.previousStatus,
              reason: event.reason,
              identifier: event.identifier,
            },
          }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process health-change notification for resource ${event.resourceId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async collectRecipients(resource: {
    id: number;
    groupIds: number[];
  }): Promise<ResourceNotificationRecipient[]> {
    const adminIds = await this.rbacService.getUserIdsWithPermission('resources.maintenance.manage');
    const admins = adminIds.length > 0 ? await this.recipientStore.findUsersByIds(adminIds) : [];
    const introducerUsers = await this.recipientStore.findIntroducerUsers(resource.id, resource.groupIds);

    const byId = new Map<number, ResourceNotificationRecipient>();
    for (const admin of admins) {
      if (admin.email) {
        byId.set(admin.id, admin);
      }
    }
    for (const user of introducerUsers) {
      if (user.email && !byId.has(user.id)) {
        byId.set(user.id, user);
      }
    }

    return Array.from(byId.values());
  }
}
