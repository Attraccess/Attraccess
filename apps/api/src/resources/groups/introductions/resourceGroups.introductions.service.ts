import { InjectRepository } from '@nestjs/typeorm';
import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';
import { GroupIntroductionWritingImplementation } from './group-introduction-writing';

@Injectable()
export class ResourceGroupsIntroductionsService extends GroupIntroductionWritingImplementation {
  protected readonly logger = new Logger(ResourceGroupsIntroductionsService.name);

  constructor(
    @InjectRepository(ResourceIntroduction)
    protected readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    protected readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  protected async getLastHistoryItemOfIntroduction(
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

  public async getManyByGroupId(groupId: number): Promise<ResourceIntroduction[]> {
    return await this.resourceIntroductionRepository.find({
      where: {
        resourceGroup: { id: groupId },
      },
      relations: ['receiverUser', 'tutorUser', 'history'],
      cache: false,
    });
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
