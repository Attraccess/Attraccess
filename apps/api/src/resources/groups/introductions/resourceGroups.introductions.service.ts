import { GroupIntroductionPersistence, GROUP_INTRODUCTION_OPERATIONS } from '../persistence/port';

import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/application-models';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { TransactionScope } from '../../../database/transaction-scope';

import { AuditService } from '../../../audit/audit.service';

import { NotificationDispatchService } from '../../../notifications/notification-dispatch.service';

import { ResourceRetrainingService } from '../../retraining/resourceRetraining.service';

import { ResourceAuditOrigin } from '../../../audit/audit-policy';

import { NotificationCategory } from '../../../notifications/notification-types';

import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';

import { ResourceGroupIntroductionChangedEvent } from './events/resource-group-introduction-changed.event';

@Injectable()
export class ResourceGroupsIntroductionsService {
  constructor(
    @Inject(GroupIntroductionPersistence) protected readonly persistence: GroupIntroductionPersistence,
    @Inject(EventEmitter2)
    protected readonly eventEmitter: EventEmitter2,
    protected readonly notifications: NotificationDispatchService,
    protected readonly retraining: ResourceRetrainingService,
    protected readonly audit: AuditService,
  ) {}

  protected operations(scope?: TransactionScope): GroupIntroductionPersistence {
    return scope ? scope.resolve(GROUP_INTRODUCTION_OPERATIONS) : this.persistence;
  }

  protected readonly logger = new Logger(ResourceGroupsIntroductionsService.name);

  protected async getLastHistoryItemOfIntroduction(
    introductionId: number,
    transactionalEntityManager?: TransactionScope,
  ): Promise<ResourceIntroductionHistoryItem | null> {
    return this.operations(transactionalEntityManager).latest(introductionId);
  }

  public async getManyByGroupId(groupId: number): Promise<ResourceIntroduction[]> {
    return this.persistence.list({ kind: 'group', id: groupId });
  }

  public async getHistoryByGroupIdAndUserId(
    groupId: number,
    userId: number,
  ): Promise<ResourceIntroductionHistoryItem[]> {
    return this.persistence.history({ kind: 'group', id: groupId }, userId);
  }

  public async hasValidIntroduction(
    { groupId, userId }: { groupId: number; userId: number },
    transactionalEntityManager?: TransactionScope,
  ): Promise<boolean> {
    const introduction = await this.operations(transactionalEntityManager).find({ kind: 'group', id: groupId }, userId);

    if (!introduction) {
      return false;
    }

    const lastHistoryItem = await this.getLastHistoryItemOfIntroduction(introduction.id, transactionalEntityManager);
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
        recipients: [{ id: userId } as User],
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

  protected async createOne(groupId: number, userId: number, tutorUserId?: number): Promise<ResourceIntroduction> {
    return this.persistence.create({ kind: 'group', id: groupId }, userId, tutorUserId);
  }

  protected async updateIntroductionStatus(
    groupId: number,
    userId: number,
    nextStatus: IntroductionHistoryAction,
    data?: UpdateResourceGroupIntroductionDto,
    tutorUserId?: number,
    performedByUserId?: number | null,
    authenticationMethod?: 'session' | 'api-token' | null,
    apiTokenId?: number | null,
  ): Promise<ResourceIntroductionHistoryItem> {
    let existingIntroduction = await this.persistence.find({ kind: 'group', id: groupId }, userId);

    if (!existingIntroduction) {
      existingIntroduction = await this.createOne(groupId, userId, tutorUserId);
    } else if (tutorUserId != null && existingIntroduction.tutorUserId !== tutorUserId) {
      await this.persistence.setTutor(existingIntroduction.id, tutorUserId);
      // Keep the in-memory entity in sync so subsequent history/logging sees the updated tutor.
      existingIntroduction.tutorUserId = tutorUserId;
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(existingIntroduction.id);
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(existingIntroduction.id))?.isDue === true;

    const savedHistoryItem = await this.persistence.appendHistory({
      introduction: existingIntroduction,
      action: nextStatus,
      performedByUserId: performedByUserId ?? userId,
      comment: data?.comment,
    });
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
        subjectType: 'resource_group',
        subjectId: groupId,
        details: { introductionId: existingIntroduction.id, usageUserId: userId },
      });
    }
    if (performedByUserId !== undefined) {
      await this.audit.recordResource({
        action: nextStatus === IntroductionHistoryAction.GRANT ? 'introduction.granted' : 'introduction.revoked',
        actorId: performedByUserId,
        authenticationMethod,
        apiTokenId,
        subjectType: 'resource_group',
        subjectId: groupId,
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
      authenticationMethod?: 'session' | 'api-token' | null;
      apiTokenId?: number | null;
    },
  ): Promise<ResourceIntroductionHistoryItem> {
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
      authenticationMethod?: 'session' | 'api-token' | null;
      apiTokenId?: number | null;
    },
  ): Promise<ResourceIntroductionHistoryItem> {
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
