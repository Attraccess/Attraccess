import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResourceIntroductionChangedEvent } from './events/resource-introduction-changed.event';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class ResourceIntroductionsService {
  private readonly logger = new Logger(ResourceIntroductionsService.name);

  constructor(
    @InjectRepository(ResourceIntroduction)
    private readonly resourceIntroductionRepository: Repository<ResourceIntroduction>,
    @InjectRepository(ResourceIntroductionHistoryItem)
    private readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>,
    @Inject(EventEmitter2)
    private readonly eventEmitter: EventEmitter2,
    private readonly metricsService: MetricsService,
  ) {}

  private async getIntroductionOfUser(
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

  private async getLastHistoryItemOfIntroduction(
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

  private async getLastHistoryItemOfUser(
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

  private async createOne(resourceId: number, userId: number): Promise<ResourceIntroduction> {
    this.logger.debug(`Creating new introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const introduction = this.resourceIntroductionRepository.create({
      resource: { id: resourceId },
      receiverUser: { id: userId },
    });

    const savedIntroduction = await this.resourceIntroductionRepository.save(introduction);
    this.logger.debug(`Created new introduction with id: ${savedIntroduction.id}`);

    return savedIntroduction;
  }

  private async updateIntroductionStatus(
    resourceId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceIntroductionDto,
  ) {
    this.logger.debug(`Updating introduction status to ${nextStatus} for resourceId: ${resourceId}, userId: ${userId}`);
    let resourceIntroduction = await this.getIntroductionOfUser(resourceId, userId);

    if (!resourceIntroduction) {
      this.logger.debug('No existing introduction found, creating new one');
      resourceIntroduction = await this.createOne(resourceId, userId);
    }

    this.logger.debug(`Creating new history item with action: ${nextStatus}`);
    const historyItem = this.resourceIntroductionHistoryItemRepository.create({
      introduction: { id: resourceIntroduction.id },
      action: nextStatus,
      comment: data?.comment,
      performedByUser: { id: userId },
    });

    const savedHistoryItem = await this.resourceIntroductionHistoryItemRepository.save(historyItem);
    this.logger.debug(`Created new history item with id: ${savedHistoryItem.id}`);

    this.eventEmitter.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(resourceIntroduction.id),
    );

    return savedHistoryItem;
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

  public async getMany(resourceId: number): Promise<ResourceIntroduction[]> {
    this.logger.debug(`Getting all introductions for resourceId: ${resourceId}`);
    const introductions = await this.resourceIntroductionRepository.find({
      where: {
        resource: { id: resourceId },
      },
      relations: ['receiverUser', 'tutorUser', 'history'],
    });
    this.logger.debug(`Found ${introductions.length} introductions for resource ${resourceId}`);
    return introductions;
  }

  public async grant(
    resourceId: number,
    userId: number,
    data?: UpdateResourceIntroductionDto,
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Granting introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const result = await this.updateIntroductionStatus(resourceId, userId, IntroductionHistoryAction.GRANT, data);
    this.metricsService.resourceIntroductionsTotal.inc();
    this.logger.debug(`Grant operation completed for resourceId: ${resourceId}, userId: ${userId}`);
    return result;
  }

  public async revoke(
    resourceId: number,
    userId: number,
    data?: UpdateResourceIntroductionDto,
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Revoking introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const result = await this.updateIntroductionStatus(resourceId, userId, IntroductionHistoryAction.REVOKE, data);
    this.logger.debug(`Revoke operation completed for resourceId: ${resourceId}, userId: ${userId}`);
    return result;
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
