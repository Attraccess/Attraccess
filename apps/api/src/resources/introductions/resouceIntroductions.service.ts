import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../audit/audit.service';
import { MetricsService } from '../../metrics/metrics.service';
import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';
import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';
import { ResourceIntroductionWritingImplementation } from './resource-introduction-writing';

@Injectable()
export class ResourceIntroductionsService extends ResourceIntroductionWritingImplementation {
  protected readonly logger = new Logger(ResourceIntroductionsService.name);

  constructor(
    @InjectRepository(ResourceIntroduction)
    protected readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    protected readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    protected readonly audit: AuditService,
  ) {
    super();
  }

  protected async getIntroductionOfUser(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroduction> {
    this.logger.debug(`Getting introduction for resourceId: ${resourceId}, userId: ${userId}`);

    const resourceIntroductionRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroduction)
      : this.resourceIntroductionRepository;

    const introduction = await resourceIntroductionRepository.findOne({
      where: {
        resource: { id: resourceId },
        receiverUser: { id: userId },
      },
    });
    this.logger.debug(`Found introduction: ${introduction ? `id=${introduction.id}` : 'null'}`);
    return introduction;
  }

  protected async getLastHistoryItemOfIntroduction(
    introductionId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Getting last history item for introductionId: ${introductionId}`);

    const resourceIntroductionHistoryItemRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceIntroductionHistoryItem)
      : this.resourceIntroductionHistoryItemRepository;

    const historyItem = await resourceIntroductionHistoryItemRepository.findOne({
      where: {
        introduction: { id: introductionId },
      },
      order: {
        createdAt: 'DESC',
      },
    });

    this.logger.debug(
      `Found last history item: ${historyItem ? `id=${historyItem.id}, action=${historyItem.action}` : 'null'}`,
    );
    return historyItem;
  }

  protected async getLastHistoryItemOfUser(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroductionHistoryItem | null> {
    this.logger.debug(`Getting last history item for resourceId: ${resourceId}, userId: ${userId}`);
    const introduction = await this.getIntroductionOfUser(resourceId, userId, transactionalEntityManager);

    if (!introduction) {
      this.logger.debug('No introduction found for user');
      return null;
    }

    const historyItem = await this.getLastHistoryItemOfIntroduction(introduction.id, transactionalEntityManager);
    this.logger.debug(
      `Last history item for user: ${historyItem ? `id=${historyItem.id}, action=${historyItem.action}` : 'null'}`,
    );
    return historyItem;
  }

  public async hasValidIntroduction(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<boolean> {
    this.logger.debug(`Checking if user ${userId} has valid introduction for resource ${resourceId}`);

    const lastHistoryItem = await this.getLastHistoryItemOfUser(resourceId, userId, transactionalEntityManager);
    const hasValid = lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
    this.logger.debug(`User has valid introduction: ${hasValid}`);
    return hasValid;
  }

  public async getMany(resourceId: number, includeGroups = false): Promise<ResourceIntroduction[]> {
    this.logger.debug(`Getting all introductions for resourceId: ${resourceId}`);
    const introductions = await this.resourceIntroductionRepository.find({
      where: includeGroups
        ? [{ resource: { id: resourceId } }, { resourceGroup: { resources: { id: resourceId } } }]
        : { resource: { id: resourceId } },
      relations: ['receiverUser', 'tutorUser', 'history', ...(includeGroups ? ['resourceGroup'] : [])],
      cache: false,
    });
    this.logger.debug(`Found ${introductions.length} introductions for resource ${resourceId}`);
    return introductions;
  }

  public async getHistoryByResourceIdAndUserId(
    resourceId: number,
    userId: number,
  ): Promise<ResourceIntroductionHistoryItem[]> {
    this.logger.debug(`Getting history for resourceId: ${resourceId}, userId: ${userId}`);
    const history = await this.resourceIntroductionHistoryItemRepository.find({
      where: { introduction: { resource: { id: resourceId }, receiverUser: { id: userId } } },
    });
    this.logger.debug(`Found ${history.length} history items for resourceId: ${resourceId}, userId: ${userId}`);
    return history;
  }
}
