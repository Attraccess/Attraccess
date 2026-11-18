import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroducerChangedEvent } from './events/resource-group-introducer-changed.event';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';
import { RESOURCE_GROUP_INTRODUCER_STORE, type ResourceGroupIntroducerStore } from '../resource-group-store.port';

@Injectable()
export class ResourceGroupsIntroducersService {
  private readonly logger = new Logger(ResourceGroupsIntroducersService.name);

  constructor(
    @Inject(RESOURCE_GROUP_INTRODUCER_STORE)
    private readonly store: ResourceGroupIntroducerStore,
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
      .dispatchToUser(userId, {
        category: NotificationCategory.ACCESS_CHANGES,
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

  public async getMany(groupId: number): Promise<ResourceIntroducerRecord[]> {
    return this.store.list(groupId);
  }

  public async grant(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducerRecord> {
    const existingIntroducer = await this.getByResourceGroupIdAndUserId(groupId, userId, type);

    if (existingIntroducer) {
      return existingIntroducer;
    }

    let savedIntroducer: ResourceIntroducerRecord;
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

  private async createOne(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType,
  ): Promise<ResourceIntroducerRecord> {
    return await this.store.insert(groupId, userId, type);
  }

  public async revoke(
    groupId: number,
    userId: number,
    type: ResourceIntroducerType = ResourceIntroducerType.INTRODUCER,
  ): Promise<ResourceIntroducerRecord> {
    const introducer = await this.getByResourceGroupIdAndUserId(groupId, userId, type);

    if (!introducer) {
      return;
    }

    await this.store.remove(introducer.id);
    this.notifyAccessChange(groupId, userId, introducer.type, false);
    this.eventEmitter.emit(
      ResourceGroupIntroducerChangedEvent.EVENT_NAME,
      new ResourceGroupIntroducerChangedEvent(groupId),
    );
    return introducer;
  }

  public async getByResourceGroupIdAndUserId(
    groupId: number,
    userId: number,
    type?: ResourceIntroducerType,
  ): Promise<ResourceIntroducerRecord | null> {
    return await this.store.find(groupId, userId, type);
  }

  public async isIntroducer({ groupId, userId }: { groupId: number; userId: number }): Promise<boolean> {
    return Boolean(await this.getByResourceGroupIdAndUserId(groupId, userId, ResourceIntroducerType.INTRODUCER));
  }
}
