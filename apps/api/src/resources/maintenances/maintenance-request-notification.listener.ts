// Emails maintainers and admins when a user requests maintenance for a resource
// FEATURE: Manual maintenance mode for resources
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource, ResourceIntroducer, ResourceMaintenanceRequest, User } from '@attraccess/database-entities';
import { ResourceMaintenanceRequestCreatedEvent } from './events/maintenance-request-created.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';
import { RbacService } from '../../users-and-auth/rbac/rbac.service';
import { createTranslator } from '../../i18n/translate';
import * as en from './maintenance-request-notification.en.json';
import * as de from './maintenance-request-notification.de.json';

const t = createTranslator({ en, de });

@Injectable()
export class MaintenanceRequestNotificationListener {
  private readonly logger = new Logger(MaintenanceRequestNotificationListener.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(ResourceMaintenanceRequest)
    private readonly requestRepository: Repository<ResourceMaintenanceRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notifications: NotificationDispatchService,
    private readonly rbacService: RbacService,
  ) {}

  @OnEvent(ResourceMaintenanceRequestCreatedEvent.EVENT_NAME)
  async handleRequestCreated(event: ResourceMaintenanceRequestCreatedEvent): Promise<void> {
    try {
      const request = await this.requestRepository.findOne({
        where: { id: event.requestId },
        relations: ['createdByUser'],
      });
      if (!request) {
        return;
      }

      const resource = await this.resourceRepository.findOne({
        where: { id: event.resourceId },
        relations: ['groups'],
      });
      if (!resource) {
        this.logger.warn(`Maintenance request for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource);
      if (recipients.length === 0) {
        return;
      }

      const requestedByUsername = request.createdByUser?.username;

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

  private async collectRecipients(resource: Resource): Promise<User[]> {
    const groupIds = (resource.groups ?? []).map((group) => group.id);

    const adminIds = await this.rbacService.getUserIdsWithPermission('resources.maintenance.manage');
    const admins = adminIds.length > 0 ? await this.userRepository.findBy({ id: In(adminIds) }) : [];

    const introducerWhere: Array<Record<string, unknown>> = [{ resourceId: resource.id }];
    if (groupIds.length > 0) {
      introducerWhere.push({ resourceGroupId: In(groupIds) });
    }
    const introducerRows = await this.resourceIntroducerRepository.find({
      where: introducerWhere,
      relations: ['user'],
    });

    const byId = new Map<number, User>();
    for (const admin of admins) {
      if (admin.email) {
        byId.set(admin.id, admin);
      }
    }
    for (const row of introducerRows) {
      if (row.user?.email && !byId.has(row.user.id)) {
        byId.set(row.user.id, row.user);
      }
    }

    return Array.from(byId.values());
  }
}
