import { InjectRepository } from '@nestjs/typeorm';

import { Inject, Injectable } from '@nestjs/common';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceGroupIntroductionChangedEvent } from './events/resource-group-introduction-changed.event';

@Injectable()
export class ResourceGroupsIntroductionsService {
  constructor(
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
    }

    const historyItem = this.resourceIntroductionHistoryItemRepository.create({
      introduction: existingIntroduction,
      action: nextStatus,
      performedByUser: { id: userId },
      comment: data?.comment,
    });

    const savedHistoryItem = await this.resourceIntroductionHistoryItemRepository.save(historyItem);
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(groupId),
    );
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
    options?: { tutorUserId?: number },
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.updateIntroductionStatus(
      groupId,
      userId,
      IntroductionHistoryAction.GRANT,
      data,
      options?.tutorUserId,
    );
  }

  public async revoke(
    groupId: number,
    userId: number,
    data?: UpdateResourceGroupIntroductionDto,
  ): Promise<ResourceIntroductionHistoryItem> {
    return await this.updateIntroductionStatus(groupId, userId, IntroductionHistoryAction.REVOKE, data);
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
