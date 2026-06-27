// Sends emails to maintainers and admins when a resource health state transitions
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource, ResourceHealthStatus, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../notifications/notification-types';

@Injectable()
export class ResourceHealthNotificationListener {
  private readonly logger = new Logger(ResourceHealthNotificationListener.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly notifications: NotificationDispatchService,
  ) {}

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  async handleHealthChanged(event: ResourceHealthChangedEvent): Promise<void> {
    if (event.previousStatus === null && event.status === ResourceHealthStatus.HEALTHY) {
      return;
    }

    try {
      const resource = await this.resourceRepository.findOne({
        where: { id: event.resourceId },
        relations: ['groups'],
      });
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
        recipients,
        title: becameUnhealthy ? `Resource degraded: ${resource.name}` : `Resource recovered: ${resource.name}`,
        body: event.reason ?? `${resource.name} changed from ${event.previousStatus ?? 'unknown'} to ${event.status}`,
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

  private async collectRecipients(resource: Resource): Promise<User[]> {
    const groupIds = (resource.groups ?? []).map((group) => group.id);

    const admins = await this.userRepository
      .createQueryBuilder('user')
      .where((qb) => `user.id IN ${qb.subQuery().select('ur.userId').from('user_role', 'ur').innerJoin('role', 'r', 'r.id = ur.roleId').where('r.key = :rKey').getQuery()}`)
      .setParameter('rKey', 'resource-manager')
      .getMany();

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
