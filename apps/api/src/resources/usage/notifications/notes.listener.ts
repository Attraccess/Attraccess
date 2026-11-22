// Emails introducers, maintainers and admins when a user attaches a note to a usage session.
// FEATURE: inform introducers/maintainers about usage notes (ATT-174)
import { optionalUserDisplayName } from '@attraccess/shared';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { ResourceNotificationRecipient } from '@attraccess/application-models';
import { RESOURCE_RECIPIENT_STORE, ResourceRecipientStore } from '../../health/resource-health-store.port';
import { ResourceUsageNoteAddedEvent } from '../events/resource-usage.events';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';
import { RbacService } from '../../../users-and-auth/rbac/rbac.service';
import { createTranslator } from '../../../i18n/translate';
import * as en from './notes.en.json';
import * as de from './notes.de.json';

const t = createTranslator({ en, de });

@Injectable()
export class ResourceUsageNoteNotificationListener {
  private readonly logger = new Logger(ResourceUsageNoteNotificationListener.name);

  constructor(
    @Inject(RESOURCE_RECIPIENT_STORE) private readonly recipientStore: ResourceRecipientStore,
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
  ) {}

  @OnEvent(ResourceUsageNoteAddedEvent.EVENT_NAME)
  async handleNoteAdded(event: ResourceUsageNoteAddedEvent): Promise<void> {
    try {
      const resource = await this.recipientStore.findResource(event.resourceId);
      if (!resource) {
        this.logger.warn(`Usage note for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource, event.author.id);
      if (recipients.length === 0) {
        return;
      }

      const authorDisplayName = optionalUserDisplayName(event.author);
      await this.notifications.dispatch({
        category: NotificationCategory.RESOURCE_USAGE_NOTES,
        recipients,
        actorId: event.author.id,
        title: (recipient) => t(recipient.locale, 'title', { resourceName: resource.name }),
        body: (recipient) => {
          const authorName = authorDisplayName ?? t(recipient.locale, 'fallbackUser');
          return t(recipient.locale, 'body', { authorName, note: event.note });
        },
        url: `/resources/${resource.id}/usage`,
        sendEmail: (recipient, language) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_USAGE_NOTES, {
            resource: { id: resource.id, name: resource.name },
            note: {
              content: event.note,
              phase: event.phase,
              authorName: authorDisplayName ?? t(language, 'fallbackUser'),
            },
          }),
      });
    } catch (error) {
      this.logger.error(
        `Failed to process usage-note notification for resource ${event.resourceId}: ${error.message}`,
        error.stack,
      );
    }
  }

  // Introducers/maintainers of the resource (or its groups) plus admins, excluding the note author.
  private async collectRecipients(
    resource: { id: number; groupIds: number[] },
    authorId: number,
  ): Promise<ResourceNotificationRecipient[]> {
    const adminIds = await this.rbacService.getUserIdsWithPermission('resources.maintenance.manage');
    const admins = adminIds.length > 0 ? await this.recipientStore.findUsersByIds(adminIds) : [];
    const introducers = await this.recipientStore.findIntroducerUsers(resource.id, resource.groupIds);

    const byId = new Map<number, ResourceNotificationRecipient>();
    for (const admin of admins) {
      if (admin.email && admin.id !== authorId) byId.set(admin.id, admin);
    }
    for (const user of introducers) {
      if (user.email && user.id !== authorId && !byId.has(user.id)) byId.set(user.id, user);
    }
    return Array.from(byId.values());
  }
}
