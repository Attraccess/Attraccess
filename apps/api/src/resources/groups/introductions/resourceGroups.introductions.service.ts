import { InjectRepository } from '@nestjs/typeorm';

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroductionChangedEvent } from './events/resource-group-introduction-changed.event';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { NotificationCategory } from '../../../notifications/notification-types';

@Injectable()
export class ResourceGroupsIntroductionsService {
  private readonly logger = new Logger(ResourceGroupsIntroductionsService.name);

  constructor(
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationDispatchService,
  ) {}

  private notifyIntroductionChange(groupId: number, userId: number, granted: boolean): void {
    const title = 'Your group access changed';
    const body = granted
      ? `You received an introduction for group #${groupId}.`
      : `Your introduction for group #${groupId} was revoked.`;
    const url = `/resource-groups/${groupId}`;

    void this.notifications.dispatch({
      category: NotificationCategory.ACCESS_CHANGES,
      recipients: [{ id: userId } as User],
      title,
      body,
      url,
      dedupeKey: `group-introduction-${groupId}-${userId}-${granted ? 'granted' : 'revoked'}`,
      sendEmail: (recipient) =>
        this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
          accessChange: { title, body, url },
        }),
    }).catch((error) => {
      this.logger.error(`Failed to notify user ${userId} about group introduction changes: ${(error as Error).message}`);
    });
  }

  private async getLastHistoryItemOfIntroduction(
    introductionId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroductionHistoryItem | null> {
    const resourceIntroductionHistoryItemRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroductionHistoryItem)
      : this.resourceIntroductionHistoryItemRepository;

    return await resourceIntroductionHistoryItemRepository.findOne({
      where: {
        introduction: {
          id: introductionId,
        },
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  private async createOne(groupId: number, userId: number, tutorUserId?: number): Promise<ResourceIntroduction> {
    const introduction = await this.resourceIntroductionRepository.create({
      resourceGroup: { id: groupId },
      receiverUser: { id: userId },
      ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
    });

    return await this.resourceIntroductionRepository.save(introduction);
  }

  private async updateIntroductionStatus(
    groupId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceGroupIntroductionDto,
    tutorUserId?: number,
    performedByUserId = userId,
  ): Promise<ResourceIntroductionHistoryItem> {
    let existingIntroduction = await this.resourceIntroductionRepository.findOne({
      where: {
        receiverUser: { id: userId },
        resourceGroup: { id: groupId },
      },
    });

    if (!existingIntroduction) {
      existingIntroduction = await this.createOne(groupId, userId, tutorUserId);
    } else if (tutorUserId != null && existingIntroduction.tutorUserId !== tutorUserId) {
      await this.resourceIntroductionRepository.update(existingIntroduction.id, { tutorUserId });
      // Keep the in-memory entity in sync so subsequent history/logging sees the updated tutor.
      existingIntroduction.tutorUserId = tutorUserId;
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(existingIntroduction.id);

    const historyItem = this.resourceIntroductionHistoryItemRepository.create({
      introduction: existingIntroduction,
      action: nextStatus,
      performedByUser: { id: performedByUserId },
      comment: data?.comment,
    });

    const savedHistoryItem = await this.resourceIntroductionHistoryItemRepository.save(historyItem);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(groupId),
    );
    if (previousHistoryItem?.action !== nextStatus && (previousHistoryItem || nextStatus === IntroductionHistoryAction.GRANT)) {
      this.notifyIntroductionChange(groupId, userId, nextStatus === IntroductionHistoryAction.GRANT);
    }
    return savedHistoryItem;
  }

  public async getManyByGroupId(groupId: number): Promise<ResourceIntroduction[]> {
    return await this.resourceIntroductionRepository.find({
      where: {
        resourceGroup: { id: groupId },
      },
      relations: ['receiverUser', 'tutorUser', 'history'],
      cache: false,
    });
  }

  public async grant(
    groupId: number,
    userId: number,
    data?: UpdateResourceGroupIntroductionDto,
    options?: { tutorUserId?: number; performedByUserId?: number },
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.updateIntroductionStatus(
      groupId,
      userId,
      IntroductionHistoryAction.GRANT,
      data,
      options?.tutorUserId,
      options?.performedByUserId,
    );
  }

  public async revoke(
    groupId: number,
    userId: number,
    data?: UpdateResourceGroupIntroductionDto,
    options?: { performedByUserId?: number },
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.updateIntroductionStatus(
      groupId,
      userId,
      IntroductionHistoryAction.REVOKE,
      data,
      undefined,
      options?.performedByUserId,
    );
  }

  public async getHistoryByGroupIdAndUserId(
    groupId: number,
    userId: number,
  ): Promise<ResourceIntroductionHistoryItem[]> {
    return await this.resourceIntroductionHistoryItemRepository.find({
      where: { introduction: { resourceGroup: { id: groupId }, receiverUser: { id: userId } } },
    });
  }

  public async hasValidIntroduction(
    { groupId, userId }: { groupId: number; userId: number },
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    const resourceIntroductionRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroduction)
      : this.resourceIntroductionRepository;

    const introduction = await resourceIntroductionRepository.findOne({
      where: {
        resourceGroup: {
          id: groupId,
        },
        receiverUser: {
          id: userId,
        },
      },
    });

    if (!introduction) {
      return false;
    }

    const lastHistoryItem = await this.getLastHistoryItemOfIntroduction(introduction.id, transactionalEntityManager);
    return lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
  }
}
