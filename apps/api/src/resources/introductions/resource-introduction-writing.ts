import {
  IntroductionHistoryAction,
  ResourceIntroduction,
  ResourceIntroductionHistoryItem,
  User,
} from '@attraccess/database-entities';
import { ResourceAuditOrigin } from '../../audit/audit-policy';
import { NotificationCategory } from '../../notifications/notification-types';
import { UpdateResourceIntroductionDto } from './dtos/update.request.dto';
import { ResourceIntroductionChangedEvent } from './events/resource-introduction-changed.event';
import { ResourceIntroductionsServiceRouteContext } from './resouceIntroductions.service.route-context';
export abstract class ResourceIntroductionWritingImplementation extends ResourceIntroductionsServiceRouteContext {
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
    const introduction = this.resourceIntroductionRepository.create({
      resource: { id: resourceId },
      receiverUser: { id: userId },
      ...(tutorUserId != null ? { tutorUser: { id: tutorUserId } } : {}),
    });

    const savedIntroduction = await this.resourceIntroductionRepository.save(introduction);
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
      await this.resourceIntroductionRepository.update(resourceIntroduction.id, { tutorUserId });
      // Keep the in-memory entity in sync so subsequent history/logging sees the updated tutor.
      resourceIntroduction.tutorUserId = tutorUserId;
    }

    const previousHistoryItem = await this.getLastHistoryItemOfIntroduction(resourceIntroduction.id);
    const retrainingWasDue =
      nextStatus === IntroductionHistoryAction.GRANT &&
      (await this.retraining.getIntroductionRetrainingStatus(resourceIntroduction.id))?.isDue === true;

    this.logger.debug(`Creating new history item with action: ${nextStatus}`);
    const historyItem = this.resourceIntroductionHistoryItemRepository.create({
      introduction: { id: resourceIntroduction.id },
      action: nextStatus,
      comment: data?.comment,
      performedByUser: { id: performedByUserId ?? userId },
    });

    const savedHistoryItem = await this.resourceIntroductionHistoryItemRepository.save(historyItem);
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
