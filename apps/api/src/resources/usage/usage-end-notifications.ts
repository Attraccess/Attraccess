import { ResourceUsage, User } from '@attraccess/database-entities';
import { SystemEvent } from '@attraccess/plugins-backend-sdk';
import { EndUsageSessionDto } from './dtos/endUsageSession.dto';
import {
  ResourceSupervisedUsageEndedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
} from './events/resource-usage.events';
import { EndSessionOptions } from './resourceUsage.service.feature-definitions';
import { UsageSessionEndImplementation } from './usage-session-end';
export abstract class UsageEndNotificationsImplementation extends UsageSessionEndImplementation {
  protected async notifySessionEnded(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    auditOrigin: NonNullable<EndSessionOptions['auditOrigin']>,
    updatedUsage: ResourceUsage,
    endedUsageIdToEmit: number | null,
    activeSession: ResourceUsage | null,
    skipNoteNotification: boolean,
  ): Promise<void> {
    await this.audit
      .recordResource({
        action: 'usage_session.ended',
        ...auditOrigin,
        subjectId: resourceId,
        details: { usageId: updatedUsage.id, usageUserId: updatedUsage.userId },
      })
      .catch(() => undefined);

    // Emit event after the transaction committed to ensure readers can observe DB state
    try {
      if (endedUsageIdToEmit) {
        await this.emitUsageEvent(endedUsageIdToEmit);
      }
    } catch (error) {
      this.logger.error(`Failed to emit usage event after endSession commit`, (error as Error).stack);
    }

    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, updatedUsage?.resource, updatedUsage?.user);

    if (updatedUsage?.user?.id && (updatedUsage.user.id !== user.id || skipNoteNotification)) {
      this.eventEmitter.emit(
        ResourceUsageSessionEndedEvent.EVENT_NAME,
        new ResourceUsageSessionEndedEvent(
          updatedUsage,
          skipNoteNotification ? null : { id: user.id, username: user.username },
        ),
      );
    }

    // Counter signal for supervised-usage auto-promotion (ATT-488): every completed supervised session
    // is counted by the listener to decide when to auto-create an introduction for the supervised user.
    if (activeSession?.supervisorUserId != null && activeSession.user?.id != null) {
      this.eventEmitter.emit(
        ResourceSupervisedUsageEndedEvent.EVENT_NAME,
        new ResourceSupervisedUsageEndedEvent(
          resourceId,
          activeSession.user.id,
          activeSession.supervisorUserId,
          activeSession.id,
        ),
      );
    }

    this.metricsService.resourceUsageSessionsTotal.inc({ action: 'end' });
    this.metricsService.resourceUsageSessionsActive.dec();
    if (updatedUsage?.startTime && updatedUsage?.endTime) {
      const durationSeconds = (updatedUsage.endTime.getTime() - updatedUsage.startTime.getTime()) / 1000;
      this.metricsService.resourceUsageDurationSeconds.observe(durationSeconds);
    }

    if (!skipNoteNotification && dto.notes?.trim()) {
      this.eventEmitter.emit(
        ResourceUsageNoteAddedEvent.EVENT_NAME,
        new ResourceUsageNoteAddedEvent(resourceId, dto.notes.trim(), 'end', {
          id: user.id,
          username: user.username,
        }),
      );
    }
  }
}
