// Emails maintainers and admins when a user requests maintenance for a resource
// FEATURE: Manual maintenance mode for resources
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { NotificationRecipient } from '@attraccess/application-models';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { createTranslator } from '../../i18n/translate';
import * as en from './maintenance-request-notification.en.json';
import * as de from './maintenance-request-notification.de.json';
import { MAINTENANCE_NOTIFICATION_STORE, type MaintenanceNotificationStore } from './maintenance-request-store.port';

const t = createTranslator({ en, de });

@Injectable()
export class MaintenanceRequestNotificationListener {
  private readonly logger = new Logger(MaintenanceRequestNotificationListener.name);

  constructor(
    @Inject(MAINTENANCE_NOTIFICATION_STORE)
    private readonly store: MaintenanceNotificationStore,
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
  ) {}

  @OnEvent(ResourceMaintenanceRequestCreatedEvent.EVENT_NAME)
  async handleRequestCreated(event: ResourceMaintenanceRequestCreatedEvent): Promise<void> {
    try {
      const request = await this.store.findRequest(event.requestId);
      if (!request) {
        return;
      }

      const resource = await this.store.findResource(event.resourceId);
      if (!resource) {
        this.logger.warn(`Maintenance request for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource);
      if (recipients.length === 0) {
        return;
      }

      const requestedByUsername = request.createdByDisplayName ?? undefined;

      await this.notifications.dispatch({
        category: NotificationCategory.MAINTENANCE_REQUESTS,
        recipients,
        title: (recipient) => t(recipient.locale, 'title', { resourceName: resource.name }),
        body: (recipient) => {
          const requestedBy = requestedByUsername ?? t(recipient.locale, 'fallbackUser');
          return t(recipient.locale, 'body', { requestedBy, reason: request.reason });
        },
        url: `/resources/${resource.id}/maintenance`,
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.MAINTENANCE_REQUESTS, {
            resource: { id: resource.id, name: resource.name },
            request: {
              id: request.id,
              reason: request.reason,
              requestedBy: requestedByUsername ?? t(recipient.locale, 'fallbackUser'),
            },
          }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process maintenance-request notification for resource ${event.resourceId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async collectRecipients(resource: { id: number; groupIds: number[] }): Promise<NotificationRecipient[]> {
    const adminIds = await this.rbacService.getUserIdsWithPermission('resources.maintenance.manage');
    const admins = adminIds.length > 0 ? await this.store.findUsersByIds(adminIds) : [];
    const introducerUsers = await this.store.findIntroducerUsers(resource.id, resource.groupIds);

    const byId = new Map<number, NotificationRecipient>();
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
