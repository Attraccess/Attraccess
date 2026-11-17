import {
  IntroductionHistoryAction,
  type IntroductionHistoryRecord,
  type IntroductionRecord,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { AUDIT_RECORDER, AuditRecorder, SYSTEM_AUDIT_ACTOR } from '../../../audit/recorder/audit-event';

import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';

import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';

import { AuditActor } from '../../../audit/recorder/audit-event';

import { NotificationCategory } from '../../../notifications/notification-types';

import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';

import { ResourceGroupIntroductionChangedEvent } from './events/resource-group-introduction-changed.event';
import type { AuthenticationMethod } from '@attraccess/database-entities';

import {
  RESOURCE_INTRODUCTION_STORE,
  type ResourceIntroductionStore,
} from '../../introductions/resource-introduction-store.port';

import type { ResourcePersistenceContext } from '../../resource-persistence-context';

type DispatchRecipient = Parameters<NotificationDispatchService['dispatch']>[0]['recipients'][number];

@Injectable()
export class ResourceGroupsIntroductionsService {
  constructor(
    @Inject(RESOURCE_INTRODUCTION_STORE)
    protected readonly store: ResourceIntroductionStore,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    @Inject(AUDIT_RECORDER) protected readonly audit: AuditRecorder,
  ) {}

  protected readonly logger = new Logger(ResourceGroupsIntroductionsService.name);

  protected async getLastHistoryItemOfIntroduction(
    introductionId: number,
    context?: ResourcePersistenceContext,
  ): Promise<IntroductionHistoryRecord | null> {
    return await this.store.lastHistoryItem(introductionId, context);
  }

  public async getManyByGroupId(groupId: number): Promise<IntroductionRecord[]> {
    return await this.store.listForGroup(groupId);
  }

  public async getHistoryByGroupIdAndUserId(groupId: number, userId: number): Promise<IntroductionHistoryRecord[]> {
    return await this.store.historyOfGroupUser(groupId, userId);
  }

  public async hasValidIntroduction(
    { groupId, userId }: { groupId: number; userId: number },
    context?: ResourcePersistenceContext,
  ): Promise<boolean> {
    const introduction = await this.store.findOfGroupUser(groupId, userId, context);

    if (!introduction) {
      return false;
    }

    const lastHistoryItem = await this.getLastHistoryItemOfIntroduction(introduction.id, context);
    return lastHistoryItem?.action === IntroductionHistoryAction.GRANT;
  }

  protected notifyIntroductionChange(groupId: number, userId: number, granted: boolean): void {
    const title = 'Your group access changed';
    const body = granted
      ? `You received an introduction for group #${groupId}.`
      : `Your introduction for group #${groupId} was revoked.`;
    const url = `/resource-groups/${groupId}`;

    void this.notifications
      .dispatch({
        category: NotificationCategory.ACCESS_CHANGES,
        recipients: [{ id: userId } as unknown as DispatchRecipient],
        title,
        body,
        url,
        dedupeKey: `group-introduction-${groupId}-${userId}-${granted ? 'granted' : 'revoked'}`,
        sendEmail: (recipient) =>
          this.notifications.sendEmailTemplate(recipient, NotificationCategory.ACCESS_CHANGES, {
            accessChange: { title, body, url },
          }),
      })
      .catch((error) => {
        this.logger.error(
          `Failed to notify user ${userId} about group introduction changes: ${(error as Error).message}`,
        );
      });
  }

  protected async createOne(groupId: number, userId: number, tutorUserId?: number): Promise<IntroductionRecord> {
    return await this.store.createForGroup(groupId, userId, tutorUserId);
  }

  protected async updateIntroductionStatus(
    groupId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceGroupIntroductionDto,
    tutorUserId?: number,
    performedByUserId?: number | null,
    authenticationMethod?: AuthenticationMethod | null,
    apiTokenId?: number | null,
  ): Promise<IntroductionHistoryRecord> {
    let existingIntroduction = await this.store.findOfGroupUser(groupId, userId);

    if (!existingIntroduction) {
      existingIntroduction = await this.createOne(groupId, userId, tutorUserId);
    } else if (tutorUserId != null && existingIntroduction.tutorUserId !== tutorUserId) {
      await this.store.setTutor(existingIntroduction.id, tutorUserId);
      // Keep the in-memory record in sync so subsequent history/logging sees the updated tutor.
      existingIntroduction = { ...existingIntroduction, tutorUserId };
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(existingIntroduction.id);
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(existingIntroduction.id))?.isDue === true;

    const savedHistoryItem = await this.store.addHistoryItem(
      existingIntroduction.id,
      nextStatus,
      data?.comment,
      performedByUserId ?? userId,
    );
    this.eventEmitter.emit(
      ResourceGroupIntroductionChangedEvent.EVENT_NAME,
      new ResourceGroupIntroductionChangedEvent(groupId),
    );
    if (
      previousHistoryItem?.action !== nextStatus &&
      (previousHistoryItem || nextStatus === IntroductionHistoryAction.GRANT)
    ) {
      this.notifyIntroductionChange(groupId, userId, nextStatus === IntroductionHistoryAction.GRANT);
    }
    const retrainingIsDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(existingIntroduction.id))?.isDue === true;
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
        subject: { type: 'resource_group', id: groupId },
        details: { introductionId: existingIntroduction.id, usageUserId: userId },
      });
    }
    if (performedByUserId !== undefined) {
      await this.audit.record({
        domain: 'resource',
        action: nextStatus === IntroductionHistoryAction.GRANT ? 'introduction.granted' : 'introduction.revoked',
        actor: { id: performedByUserId, authenticationMethod: authenticationMethod, apiTokenId: apiTokenId },
        subject: { type: 'resource_group', id: groupId },
        details: { recipientUserId: userId, ...(tutorUserId === undefined ? {} : { tutorUserId }) },
      });
    }
    return savedHistoryItem;
  }

  public async grant(
    groupId: number,
    userId: number,
    data?: UpdateResourceGroupIntroductionDto,
    options?: {
      tutorUserId?: number;
      performedByUserId?: number | null;
      authenticationMethod?: AuthenticationMethod | null;
      apiTokenId?: number | null;
    },
  ): Promise<IntroductionHistoryRecord> {
    return await this.updateIntroductionStatus(
      groupId,
      userId,
      IntroductionHistoryAction.GRANT,
      data,
      options?.tutorUserId,
      options?.performedByUserId,
      options?.authenticationMethod,
      options?.apiTokenId,
    );
  }

  public async revoke(
    groupId: number,
    userId: number,
    data?: UpdateResourceGroupIntroductionDto,
    options?: {
      performedByUserId?: number | null;
      authenticationMethod?: AuthenticationMethod | null;
      apiTokenId?: number | null;
    },
  ): Promise<IntroductionHistoryRecord> {
    return await this.updateIntroductionStatus(
      groupId,
      userId,
      IntroductionHistoryAction.REVOKE,
      data,
      undefined,
      options?.performedByUserId,
      options?.authenticationMethod,
      options?.apiTokenId,
    );
  }
}
