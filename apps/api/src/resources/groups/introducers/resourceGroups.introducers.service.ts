import { InjectRepository } from '@nestjs/typeorm';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceIntroducer, ResourceIntroducerType, User } from '@attraccess/database-entities';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroducerChangedEvent } from './events/resource-group-introducer-changed.event';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';

@Injectable()
export class ResourceGroupsIntroducersService {
  private readonly logger = new Logger(ResourceGroupsIntroducersService.name);

  constructor(
    @InjectRepository(ResourceIntroducer)
    private readonly resourceIntroducerRepository: Repository<ResourceIntroducer>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private notifyAccessChange(groupId: number, userId: number, type: ResourceIntroducerType, granted: boolean): void {
    const role = type === ResourceIntroducerType.MAINTAINER ? 'maintainer' : 'introducer';
    const title = 'Your group access changed';
    const body = granted
      ? `You were made an ${role} for group #${groupId}.`.replace('an maintainer', 'a maintainer')
      : `Your ${role} status for group #${groupId} was revoked.`;
    const url = `/resource-groups/${groupId}`;

    void this.notifications
      .dispatch({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [{ id: userId } as User],
        title,
        body,
        url,
        dedupeKey: `group-access-${groupId}-${userId}-${role}-${granted ? 'granted' : 'revoked'}`,
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
            accessChange: { title, body, url },
          }),
      })
      .catch((error) => {
        this.logger.error(`Failed to notify user ${userId} about group access changes: ${(error as Error).message}`);
      });
  }

  public async getMany(groupId: number): Promise<ResourceIntroducer[]> {
    return this.resourceIntroducerRepository.find({
      where: {
        resourceGroup: {
          id: groupId,
        },
      },
      relations: ['user'],
    });
  }

  public async grant(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const existingIntroducer = await this.getByResourceGroupIdAndUserId(groupId, userId, type);

    if (existingIntroducer) {
      return existingIntroducer;
    }

    let savedIntroducer: ResourceIntroducer;
    try {
      savedIntroducer = await this.createOne(groupId, userId, type);
    } catch (error) {
      const concurrentGrant = await this.getByResourceGroupIdAndUserId(groupId, userId, type);
      if (concurrentGrant) {
        return concurrentGrant;
      }
      throw error;
    }
    this.notifyAccessChange(groupId, userId, type, true);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return savedIntroducer;
  }

  private async createOne(groupId: number, userId: number, type: ResourceIntroducerType): Promise<ResourceIntroducer> {
    const introducer = this.resourceIntroducerRepository.create({
      resourceGroup: { id: groupId },
      user: { id: userId },
      type,
    });

    return await this.resourceIntroducerRepository.save(introducer, { reload: true });
  }

  public async revoke(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducer> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId, type);

    if (!introducer) {
      return;
    }

    const savedIntroducer = await this.resourceIntroducerRepository.remove(introducer);
    this.notifyAccessChange(groupId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return savedIntroducer;
  }

  public async getByResourceGroupIdAndUserId(
    groupId: number,
    userId: number,
    type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducer | null> {
    return await this.resourceIntroducerRepository.findOne({
      where: {
        resourceGroup: { id: groupId },
        user: { id: userId },
        ...(type ? { type } : {}),
      },
    });
  }

  public async isIntroducer({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    return Boolean(await this.getByResourceGroupIdAndUserId(groupId, userId, ResourceIntroducerType.INTRODUCER));
  }
}
