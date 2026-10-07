import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/database-entities';
import { ResourceAuditOrigin } from '../../../audit/audit-policy';
import { NotificationCategory } from '../../../notifications/notification-types';
import { UpdateResourceGroupIntroductionDto } from './dtos/update.request.dto';
import { ResourceGroupIntroductionChangedEvent } from './events/resource-group-introduction-changed.event';
import { ResourceGroupsIntroductionsServiceRouteContext } from './resourceGroups.introductions.service.route-context';
export abstract class GroupIntroductionWritingImplementation extends ResourceGroupsIntroductionsServiceRouteContext {
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
    const introduction = await this.resourceIntroductionRepository.create({
      resourceGroup: { id: groupId },
      receiverUser: { id: userId },
      ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
    });

    return await this.resourceIntroductionRepository.save(introduction);
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
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(existingIntroduction.id))?.isDue === true;

    const historyItem = this.resourceIntroductionHistoryItemRepository.create({
      introduction: existingIntroduction,
      action: nextStatus,
      performedByUser: { id: performedByUserId ?? userId },
      comment: data?.comment,
    });

    const savedHistoryItem = await this.resourceIntroductionHistoryItemRepository.save(historyItem);
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
