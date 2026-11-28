import { Inject, Injectable, Logger } from '@nestjs/common';
import { ResourceIntroducerType, type ResourceIntroducerRecord } from '@attraccess/application-models';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroducerChangedEvent } from './events/resource-group-introducer-changed.event';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { dispatchAccessChange, nameForAccessChange } from '../../access-change-notification';
import { createTranslator } from '../../../i18n/translate';
import * as de from './resourceGroups.introducers.de.json';
import * as en from './resourceGroups.introducers.en.json';
import { RESOURCE_GROUP_INTRODUCER_STORE, type ResourceGroupIntroducerStore } from '../resource-group-store.port';

const t = createTranslator({ en, de });

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
    const role = type === ResourceIntroducerType.MAINTAINER ? 'Maintainer' : 'Introducer';
    const bodyKey = `${granted ? 'granted' : 'revoked'}${role}`;

    void nameForAccessChange(groupId, (id) => this.store.findGroupName(id), this.logger)
      .then((groupName) =>
        dispatchAccessChange(this.notifications, {
          userId,
          title: (language) => t(language, 'title'),
          body: (language) => t(language, bodyKey, { groupName }),
          url: `/resource-groups/${groupId}`,
          dedupeKey: `group-access-${groupId}-${userId}-${role.toLowerCase()}-${granted ? 'granted' : 'revoked'}`,
        }),
      )
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
