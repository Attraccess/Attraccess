// Sends emails to maintainers and admins when a resource health state transitions
// FEATURE: Resource health monitoring system for subsystem-level status tracking
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource, ResourceHealthStatus, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceHealthChangedEvent } from './events/resource-health-changed.event';
import { EmailService } from '../../email/email.service';

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
    private readonly emailService: EmailService,
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

      this.logger.log(
        `Dispatching health-change emails to ${recipients.length} user(s) for resource ${resource.id} (${event.previousStatus} -> ${event.status})`,
      );

      await Promise.all(
        recipients.map((recipient) =>
          this.emailService
            .sendResourceHealthChangedEmail(
              recipient,
              { id: resource.id, name: resource.name },
              {
                status: event.status,
                previousStatus: event.previousStatus,
                reason: event.reason,
                identifier: event.identifier,
              },
            )
            .catch((error) => {
              this.logger.error(
                `Failed to send health-change email to user ${recipient.id} for resource ${resource.id}: ${error.message}`,
                error.stack,
              );
            }),
        ),
      );
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
      .where('user.canManageResources = :value', { value: true })
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
