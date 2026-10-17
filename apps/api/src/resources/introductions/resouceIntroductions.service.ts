import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { IntroductionPersistence, INTRODUCTION_OPERATIONS } from './persistence/port';

import { TransactionScope } from '../../database/transaction-scope';

import { AuditService } from '../../audit/audit.service';

import { MetricsService } from '../../metrics/metrics.service';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';

import { ResourceAuditOrigin } from '../../audit/audit-policy';

import { NotificationCategory } from '../../notifications/notification-types';

import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';

import { ResourceIntroductionChangedEvent } from './events/resource-introduction-changed.event';

@Injectable()
export class ResourceIntroductionsService {
  constructor(
    @Inject(IntroductionPersistence) protected readonly persistence: IntroductionPersistence,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    protected readonly audit: AuditService,
  ) {}

  protected operations(scope?: TransactionScope): IntroductionPersistence {
    return scope ? scope.resolve(INTRODUCTION_OPERATIONS) : this.persistence;
  }

  protected readonly logger = new Logger(ResourceIntroductionsService.name);

  protected async getIntroductionOfUser(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: TransactionScope,
  ): Promise<ResourceIntroduction> {
    this.logger.debug(`Getting introduction for resourceId: ${resourceId}, userId: ${userId}`);

    const introduction = await this.operations(transactionalEntityManager).find(
      { kind: 'resource', id: resourceId },
      userId,
    );
    this.logger.debug(`Found introduction: ${introduction ? `id=${introduction.id}` : 'null'}`);
    return introduction;
  }

  protected async getLastHistoryItemOfIntroduction(
    introductionId: number,
    transactionalEntityManager?: TransactionScope,
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Getting last history item for introductionId: ${introductionId}`);

    const historyItem = await this.operations(transactionalEntityManager).latest(introductionId);

    this.logger.debug(
      `Found last history item: ${historyItem ? `id=${historyItem.id}, action=${historyItem.action}` : 'null'}`,
    );
    return historyItem;
  }

  protected async getLastHistoryItemOfUser(
    resourceId: number,
    userId: number,
    transactionalEntityManager?: TransactionScope,
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
    transactionalEntityManager?: TransactionScope,
  ): Promise<boolean> {
    this.logger.debug(`Checking if user ${userId} has valid introduction for resource ${resourceId}`);

    const lastHistoryItem = await this.getLastHistoryItemOfUser(resourceId, userId, transactionalEntityManager);
    const hasValid = lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
    this.logger.debug(`User has valid introduction: ${hasValid}`);
    return hasValid;
  }

  public async getMany(resourceId: number, includeGroups = false): Promise<ResourceIntroduction[]> {
    this.logger.debug(`Getting all introductions for resourceId: ${resourceId}`);
    const introductions = await this.persistence.list({ kind: 'resource', id: resourceId }, includeGroups);
    this.logger.debug(`Found ${introductions.length} introductions for resource ${resourceId}`);
    return introductions;
  }

  public async getHistoryByResourceIdAndUserId(
    resourceId: number,
    userId: number,
  ): Promise<ResourceIntroductionHistoryItem[]> {
    this.logger.debug(`Getting history for resourceId: ${resourceId}, userId: ${userId}`);
    const history = await this.persistence.history({ kind: 'resource', id: resourceId }, userId);
    this.logger.debug(`Found ${history.length} history items for resourceId: ${resourceId}, userId: ${userId}`);
    return history;
  }

  protected notifyIntroductionChange(resourceId: number, userId: number, granted: boolean): void {
    const title = 'Your resource access changed';
    const body = granted
      ? `You received an introduction for resource #${resourceId}.`
      : `Your introduction for resource #${resourceId} was revoked.`;
    const url = `/resources/${resourceId}`;

    void this.notifications
      .dispatch({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [{ id: userId } as User],
        title,
        body,
        url,
        dedupeKey: `resource-introduction-${resourceId}-${userId}-${granted ? 'granted' : 'revoked'}`,
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
            accessChange: { title, body, url },
          }),
      })
      .catch((error) => {
        this.logger.error(
          `Failed to notify user ${userId} about resource introduction changes: ${(error as Error).message}`,
        );
      });
  }

  protected async createOne(resourceId: number, userId: number, tutorUserId?: number): Promise<ResourceIntroduction> {
    this.logger.debug(`Creating new introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const savedIntroduction = await this.persistence.create({ kind: 'resource', id: resourceId }, userId, tutorUserId);
    this.logger.debug(`Created new introduction with id: ${savedIntroduction.id}`);

    return savedIntroduction;
  }

  protected async updateIntroductionStatus(
    resourceId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceIntroductionDto,
    tutorUserId?: number,
    performedByUserId?: number | null,
    authenticationMethod?: 'session' | 'api-token' | null,
    apiTokenId?: number | null,
  ) {
    this.logger.debug(`Updating introduction status to ${nextStatus} for resourceId: ${resourceId}, userId: ${userId}`);
    let resourceIntroduction = await this.getIntroductionOfUser(resourceId, userId);

    if (!resourceIntroduction) {
      this.logger.debug('No existing introduction found, creating new one');
      resourceIntroduction = await this.createOne(resourceId, userId, tutorUserId);
    } else if (tutorUserId != null && resourceIntroduction.tutorUserId !== tutorUserId) {
      await this.persistence.setTutor(resourceIntroduction.id, tutorUserId);
      // Keep the in-memory entity in sync so subsequent history/logging sees the updated tutor.
      resourceIntroduction.tutorUserId = tutorUserId;
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(resourceIntroduction.id);
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(resourceIntroduction.id))?.isDue === true;

    this.logger.debug(`Creating new history item with action: ${nextStatus}`);
    const savedHistoryItem = await this.persistence.appendHistory({
      introduction: { id: resourceIntroduction.id },
      action: nextStatus,
      comment: data?.comment,
      performedByUserId: performedByUserId ?? userId,
    });
    this.logger.debug(`Created new history item with id: ${savedHistoryItem.id}`);

    this.eventEmitter.emit(
      ResourceIntroductionChangedEvent.EVENT_NAME,
      new ResourceIntroductionChangedEvent(resourceIntroduction.id),
    );
    if (
      previousHistoryItem?.action !== nextStatus &&
      (previousHistoryItem || nextStatus === IntroductionHistoryAction.GRANT)
    ) {
      this.notifyIntroductionChange(resourceId, userId, nextStatus === IntroductionHistoryAction.GRANT);
    }
    const retrainingIsDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(resourceIntroduction.id))?.isDue === true;
    if (retrainingWasDue && !retrainingIsDue) {
      const retrainingOrigin: ResourceAuditOrigin =
        performedByUserId === null
          ? { actorId: null }
          : {
              actorId: performedByUserId ?? userId,
              authenticationMethod: authenticationMethod === undefined ? 'session' : authenticationMethod,
              ...(apiTokenId === undefined || apiTokenId === null ? {} : { apiTokenId }),
            };
      await this.audit.recordResource({
        action: 'retraining.cleared',
        ...retrainingOrigin,
        subjectId: resourceId,
        details: { introductionId: resourceIntroduction.id, usageUserId: userId },
      });
    }

    if (performedByUserId !== undefined) {
      await this.audit.recordResource({
        action: nextStatus === IntroductionHistoryAction.GRANT ? 'introduction.granted' : 'introduction.revoked',
        actorId: performedByUserId,
        authenticationMethod,
        apiTokenId,
        subjectId: resourceId,
        details: { recipientUserId: userId, ...(tutorUserId === undefined ? {} : { tutorUserId }) },
      });
    }
    return savedHistoryItem;
  }

  public async grant(
    resourceId: number,
    userId: number,
    data?: UpdateResourceIntroductionDto,
    options?: {
      tutorUserId?: number;
      performedByUserId?: number | null;
      authenticationMethod?: 'session' | 'api-token' | null;
      apiTokenId?: number | null;
    },
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Granting introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const result = await this.updateIntroductionStatus(
      resourceId,
      userId,
      IntroductionHistoryAction.GRANT,
      data,
      options?.tutorUserId,
      options?.performedByUserId,
      options?.authenticationMethod,
      options?.apiTokenId,
    );
    this.metricsService.resourceIntroductionsTotal.inc();
    this.logger.debug(`Grant operation completed for resourceId: ${resourceId}, userId: ${userId}`);
    return result;
  }

  public async revoke(
    resourceId: number,
    userId: number,
    data?: UpdateResourceIntroductionDto,
    options?: {
      performedByUserId?: number | null;
      authenticationMethod?: 'session' | 'api-token' | null;
      apiTokenId?: number | null;
    },
  ): Promise<ResourceIntroductionHistoryItem> {
    this.logger.debug(`Revoking introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const result = await this.updateIntroductionStatus(
      resourceId,
      userId,
      IntroductionHistoryAction.REVOKE,
      data,
      undefined,
      options?.performedByUserId,
      options?.authenticationMethod,
      options?.apiTokenId,
    );
    this.logger.debug(`Revoke operation completed for resourceId: ${resourceId}, userId: ${userId}`);
    return result;
  }
}
