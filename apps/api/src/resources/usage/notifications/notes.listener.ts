// Emails introducers, maintainers and admins when a user attaches a note to a usage session.
// FEATURE: inform introducers/maintainers about usage notes (ATT-174)
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { UsageNoteRecipients } from '../persistence/port';
import { Resource, User } from '@attraccess/application-models';
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
    private readonly persistence: UsageNoteRecipients,
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
  ) {}

  @OnEvent(ResourceUsageNoteAddedEvent.EVENT_NAME)
  async handleNoteAdded(event: ResourceUsageNoteAddedEvent): Promise<void> {
    try {
      const resource = await this.persistence.resourceWithGroups(event.resourceId);
      if (!resource) {
        this.logger.warn(`Usage note for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource, event.author.id);
      if (recipients.length === 0) {
        return;
      }

      const authorUsername = event.author.username;
      await this.notifications.dispatch({
        category: NotificationCategory.RESOURCE_USAGE_NOTES,
        recipients,
        actorId: event.author.id,
        title: (recipient) => t(recipient.locale, 'title', { resourceName: resource.name }),
        body: (recipient) => {
          const authorName = authorUsername ?? t(recipient.locale, 'fallbackUser');
          return t(recipient.locale, 'body', { authorName, note: event.note });
        },
        url: `/resources/${resource.id}/usage`,
        sendEmail: (recipient, language) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.RESOURCE_USAGE_NOTES, {
            resource: { id: resource.id, name: resource.name },
            note: {
              content: event.note,
              phase: event.phase,
              authorName: authorUsername ?? t(language, 'fallbackUser'),
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
  private async collectRecipients(resource: Resource, authorId: number): Promise<User[]> {
    const groupIds = (resource.groups ?? []).map((group) => group.id);

    const adminIds = await this.rbacService.getUserIdsWithPermission('resources.maintenance.manage');
    const admins = adminIds.length > 0 ? await this.persistence.users(adminIds) : [];

    const introducerRows = await this.persistence.introducers(resource.id, groupIds);

    const byId = new Map<number, User>();
    for (const admin of admins) {
      if (admin.email && admin.id !== authorId) {
        byId.set(admin.id, admin);
      }
    }
    for (const row of introducerRows) {
      if (row.user?.email && row.user.id !== authorId && !byId.has(row.user.id)) {
        byId.set(row.user.id, row.user);
      }
    }

    return Array.from(byId.values());
  }
}
