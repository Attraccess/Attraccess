import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
} from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, Repository } from 'typeorm';
import { AuditService } from '../../../audit/audit.service';
import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';
import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';
import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';

export abstract class ResourceGroupsIntroductionsServiceRouteContext {
  protected abstract readonly notifications: NotificationDispatchService;
  protected abstract readonly logger: Logger;
  protected abstract readonly resourceIntroductionRepository: Repository<ResourceIntroduction>;
  protected abstract createOne(groupId: number, userId: number, tutorUserId?: number): Promise<ResourceIntroduction>;
  protected abstract getLastHistoryItemOfIntroduction(
    introductionId: number,
    transactionalEntityManager?: EntityManager,
  ): Promise<ResourceIntroductionHistoryItem | null>;
  protected abstract readonly retraining: ResourceRetrainingService;
  protected abstract readonly resourceIntroductionHistoryItemRepository: Repository<ResourceIntroductionHistoryItem>;
  protected abstract readonly eventEmitter: EventEmitter2;
  protected abstract notifyIntroductionChange(groupId: number, userId: number, granted: boolean): void;
  protected abstract readonly audit: AuditService;
  protected abstract updateIntroductionStatus(
    groupId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceGroupIntroductionDto,
    tutorUserId?: number,
    performedByUserId?: number | null,
    authenticationMethod?: 'session' | 'api-token' | null,
    apiTokenId?: number | null,
  ): Promise<ResourceIntroductionHistoryItem>;
}
