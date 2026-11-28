import {
  IntroductionHistoryAction,
  type IntroductionHistoryRecord,
  type IntroductionRecord,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AUDIT_RECORDER, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../audit/recorder/audit-event';

import { MetricsService } from '../../metrics/metrics.service';

import { NotificationDispatchService } from '../../notifications/notification-dispatch.service';

import { ResourceRetrainingService } from '../retraining/resourceRetraining.service';

import { AuditActor } from '../../audit/recorder/audit-event';

import { dispatchAccessChange, nameForAccessChange } from '../access-change-notification';

import { createTranslator } from '../../i18n/translate';

import * as de from './resourceIntroductions.de.json';

import * as en from './resourceIntroductions.en.json';

import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';

import { ResourceIntroductionChangedEvent } from './events/resource-introduction-changed.event';
import type { AuthenticationMethod } from '@attraccess/application-models';

import { RESOURCE_INTRODUCTION_STORE, type ResourceIntroductionStore } from './resource-introduction-store.port';

import type { ResourcePersistenceContext } from '../resource-persistence-context';

const t = createTranslator({ en, de });

@Injectable()
export class ResourceIntroductionsService {
  constructor(
    @Inject(RESOURCE_INTRODUCTION_STORE)
    protected readonly store: ResourceIntroductionStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly metricsService: MetricsService,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(ResourceIntroductionsService.name);

  protected async getIntroductionOfUser(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionRecord | null> {
    this.logger.debug(`Getting introduction for resourceId: ${resourceId}, userId: ${userId}`);

    const introduction = await this.store.findOfUser(resourceId, userId, context);
    this.logger.debug(`Found introduction: ${introduction ? `id=${introduction.id}` : 'null'}`);
    return introduction;
  }

  protected async getLastHistoryItemOfIntroduction(
    introductionId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionHistoryRecord | null> {
    this.logger.debug(`Getting last history item for introductionId: ${introductionId}`);

    const historyItem = await this.store.lastHistoryItem(introductionId, context);

    this.logger.debug(
      `Found last history item: ${historyItem ? `id=${historyItem.id}, action=${historyItem.action}` : 'null'}`,
    );
    return historyItem;
  }

  protected async getLastHistoryItemOfUser(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionHistoryRecord | null> {
    this.logger.debug(`Getting last history item for resourceId: ${resourceId}, userId: ${userId}`);
    const introduction = await this.getIntroductionOfUser(resourceId, userId, context);

    if (!introduction) {
      this.logger.debug('No introduction found for user');
      return null;
    }

    const historyItem = await this.getLastHistoryItemOfIntroduction(introduction.id, context);
    this.logger.debug(
      `Last history item for user: ${historyItem ? `id=${historyItem.id}, action=${historyItem.action}` : 'null'}`,
    );
    return historyItem;
  }

  public async hasValidIntroduction(
    resourceId: number,
    userId: number,
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    this.logger.debug(`Checking if user ${userId} has valid introduction for resource ${resourceId}`);

    const lastHistoryItem = await this.getLastHistoryItemOfUser(resourceId, userId, context);
    const hasValid = lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
    this.logger.debug(`User has valid introduction: ${hasValid}`);
    return hasValid;
  }

  public async getMany(resourceId: number, includeGroups = false): Promise<IntroductionRecord[]> {
    this.logger.debug(`Getting all introductions for resourceId: ${resourceId}`);
    const introductions = await this.store.listForResource(resourceId, includeGroups);
    this.logger.debug(`Found ${introductions.length} introductions for resource ${resourceId}`);
    return introductions;
  }

  public async getHistoryByResourceIdAndUserId(
    resourceId: number,
    userId: number,
  ): Promise<IntroductionHistoryRecord[]> {
    this.logger.debug(`Getting history for resourceId: ${resourceId}, userId: ${userId}`);
    const history = await this.store.historyOfUser(resourceId, userId);
    this.logger.debug(`Found ${history.length} history items for resourceId: ${resourceId}, userId: ${userId}`);
    return history;
  }

  protected notifyIntroductionChange(resourceId: number, userId: number, granted: boolean): void {
    const bodyKey = granted ? 'granted' : 'revoked';

    void nameForAccessChange(resourceId, (id) => this.store.findResourceName(id), this.logger)
      .then((resourceName) =>
        dispatchAccessChange(this.notifications, {
          userId,
          title: (language) => t(language, 'title'),
          body: (language) => t(language, bodyKey, { resourceName }),
          url: `/resources/${resourceId}`,
          dedupeKey: `resource-introduction-${resourceId}-${userId}-${bodyKey}`,
        }),
      )
      .catch((error) => {
        this.logger.error(
          `Failed to notify user ${userId} about resource introduction changes: ${(error as Error).message}`,
        );
      });
  }

  protected async createOne(resourceId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord> {
    this.logger.debug(`Creating new introduction for resourceId: ${resourceId}, userId: ${userId}`);
    const savedIntroduction = await this.store.create(resourceId, userId, tutorUserId);
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
    authenticationMethod?: AuthenticationMethod | null,
    apiTokenId?: number | null,
  ) {
    this.logger.debug(`Updating introduction status to ${nextStatus} for resourceId: ${resourceId}, userId: ${userId}`);
    let resourceIntroduction = await this.getIntroductionOfUser(resourceId, userId);

    if (!resourceIntroduction) {
      this.logger.debug('No existing introduction found, creating new one');
      resourceIntroduction = await this.createOne(resourceId, userId, tutorUserId);
    } else if (tutorUserId != null && resourceIntroduction.tutorUserId !== tutorUserId) {
      await this.store.setTutor(resourceIntroduction.id, tutorUserId);
      // Keep the in-memory record in sync so subsequent history/logging sees the updated tutor.
      resourceIntroduction = { ...resourceIntroduction, tutorUserId };
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(resourceIntroduction.id);
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(resourceIntroduction.id))?.isDue === true;

    this.logger.debug(`Creating new history item with action: ${nextStatus}`);
    const savedHistoryItem = await this.store.addHistoryItem(
      resourceIntroduction.id,
      nextStatus,
      data?.comment,
      performedByUserId ?? userId,
    );
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
      const retrainingOrigin: AuditActor =
        performedByUserId === null
          ? SYSTEM_AUDIT_ACTOR
          : {
              id: performedByUserId ?? userId,
              authenticationMethod: authenticationMethod === undefined ? 'session' : authenticationMethod,
              ...(apiTokenId === undefined || apiTokenId === null ? {} : { apiTokenId }),
            };
      await this.audit.record({
        domain: 'resource',
        action: 'retraining.cleared',
        actor: retrainingOrigin,
        subject: { type: 'resource', id: resourceId },
        details: { introductionId: resourceIntroduction.id, usageUserId: userId },
      });
    }

    if (performedByUserId !== undefined) {
      await this.audit.record({
        domain: 'resource',
        action: nextStatus === IntroductionHistoryAction.GRANT ? 'introduction.granted' : 'introduction.revoked',
        actor: { id: performedByUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
        subject: { type: 'resource', id: resourceId },
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
      authenticationMethod?: AuthenticationMethod | null;
      apiTokenId?: number | null;
    },
  ): Promise<IntroductionHistoryRecord> {
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
      authenticationMethod?: AuthenticationMethod | null;
      apiTokenId?: number | null;
    },
  ): Promise<IntroductionHistoryRecord> {
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
