// Emails introducers, maintainers and admins when a user attaches a note to a usage session.
// FEATURE: inform introducers/maintainers about usage notes (ATT-174)
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Resource, ResourceIntroducer, User } from '@attraccess/database-entities';
import { ResourceUsageNoteAddedEvent } from './events/resource-usage.events';
import { EmailService } from '../../email/email.service';

@Injectable()
export class ResourceUsageNoteNotificationListener {
  private readonly logger = new Logger(ResourceUsageNoteNotificationListener.name);

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly emailService: EmailService,
  ) {}

  @OnEvent(ResourceUsageNoteAddedEvent.EVENT_NAME)
  async handleNoteAdded(event: ResourceUsageNoteAddedEvent): Promise<void> {
    try {
      const resource = await this.resourceRepository.findOne({
        where: { id: event.resourceId },
        relations: ['groups'],
      });
      if (!resource) {
        this.logger.warn(`Usage note for missing resource ${event.resourceId}; skipping notifications`);
        return;
      }

      const recipients = await this.collectRecipients(resource, event.author.id);
      if (recipients.length === 0) {
        return;
      }

      this.logger.log(
        `Dispatching usage-note emails to ${recipients.length} user(s) for resource ${resource.id}`,
      );

      await Promise.all(
        recipients.map((recipient) =>
          this.emailService
            .sendResourceUsageNoteEmail(
              recipient,
              { id: resource.id, name: resource.name },
              { content: event.note, phase: event.phase, authorName: event.author.username ?? 'A user' },
            )
            .catch((error) => {
              this.logger.error(
                `Failed to send usage-note email to user ${recipient.id} for resource ${resource.id}: ${error.message}`,
                error.stack,
              );
            }),
        ),
      );
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
