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
    void this.notifications.dispatch({
      category: NotificationCategory.ACCESS_CHANGES,
      recipients: [{ id: userId } as User],
      title: 'Your group access changed',
      body: granted
        ? `You were made an ${role} for group #${groupId}.`.replace('an maintainer', 'a maintainer')
        : `Your ${role} status for group #${groupId} was revoked.`,
      url: `/resource-groups/${groupId}`,
      dedupeKey: `group-access-${groupId}-${userId}-${role}-${granted ? 'granted' : 'revoked'}`,
    }).catch((error) => {
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
    const existingIntroducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

    if (existingIntroducer) {
      if (existingIntroducer.type !== type) {
        existingIntroducer.type = type;
        await this.resourceIntroducerRepository.save(existingIntroducer);
        this.notifyAccessChange(groupId, userId, type, true);
        this.eventEmitter.emit(
          ResourceGroupIntroducerChangedEvent.EVENT_NAME,
          new ResourceGroupIntroducerChangedEvent(groupId),
        );
      }
      return existingIntroducer;
    }

    const savedIntroducer = await this.createOne(groupId, userId, type);
    this.notifyAccessChange(groupId, userId, type, true);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return savedIntroducer;
  }

  private async createOne(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType,
  ): Promise<ResourceIntroducer> {
    const introducer = this.resourceIntroducerRepository.create({
      resourceGroup: { id: groupId },
      user: { id: userId },
      type,
    });

    return await this.resourceIntroducerRepository.save(introducer, { reload: true });
  }

  public async revoke(groupId: number, userId: number): Promise<ResourceIntroducer> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

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

  public async getByResourceGroupIdAndUserId(groupId: number, userId: number): Promise<ResourceIntroducer | null> {
    return await this.resourceIntroducerRepository.findOne({
      where: {
        resourceGroup: { id: groupId },
        user: { id: userId },
      },
    });
  }

  public async isIntroducer({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId);

    return introducer?.type === ResourceIntroducerType.INTRODUCER;
  }
}
