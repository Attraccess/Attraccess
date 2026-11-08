import { ResourceUsage, User } from '@attraccess/database-entities';

import { SystemEvent } from '@attraccess/plugins-backend-sdk';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import {
  ResourceSupervisedUsageStartedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../events/resource-usage.events';

import { type ResourceUsageService } from './resource-usage.service';

import { UsageSessionChanges } from './usage-session-changes';

/** Events and metrics once a start or takeover has committed. */
export abstract class UsageSessionStartNotifications extends UsageSessionChanges {
  protected async notifySessionStarted(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    prepared: Awaited<ReturnType<ResourceUsageService['prepareSessionStart']>>,
    newSession: ResourceUsage,
    startedUsageIdToEmit: number | null,
    takeoverEndedUser: User | null,
  ): Promise<void> {
    if (prepared.existingActiveSession) {
      this.eventEmitter.emit(
        ResourceUsageSessionTakenOverEvent.EVENT_NAME,
        new ResourceUsageSessionTakenOverEvent(
          prepared.resource,
          prepared.attempt.transitionTime,
          user,
          prepared.existingActiveSession.user,
        ),
      );
    }

    // Emit events after the transaction committed to ensure readers can observe DB state
    try {
      // The taken-over session is announced by the take-over event above, never as a start.
      if (newSession?.id) {
        await this.emitUsageEvent(newSession.id);
      } else if (startedUsageIdToEmit) {
        await this.emitUsageEvent(startedUsageIdToEmit);
      }
    } catch (error) {
      this.logger.error(`Failed to emit usage events after startSession commit`, (error as Error).stack);
    }

    if (takeoverEndedUser) {
      this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, newSession?.resource, takeoverEndedUser);
    }
    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_STARTED, newSession?.resource, newSession?.user);

    // Counter signal for the supervised-usage auto-promotion follow-up (ATT-486): every supervised
    // session start is counted there to decide when to auto-create an introduction for the user.
    if (supervisorUserId !== null && newSession?.id) {
      this.eventEmitter.emit(
        ResourceSupervisedUsageStartedEvent.EVENT_NAME,
        new ResourceSupervisedUsageStartedEvent(resourceId, user.id, supervisorUserId, newSession.id),
      );
    }

    this.metricsService.resourceUsageSessionsTotal.inc({ action: 'start' });
    this.metricsService.resourceUsageSessionsActive.inc();

    if (dto.notes?.trim()) {
      this.eventEmitter.emit(
        ResourceUsageNoteAddedEvent.EVENT_NAME,
        new ResourceUsageNoteAddedEvent(resourceId, dto.notes.trim(), 'start', {
          id: user.id,
          username: user.username,
        }),
      );
    }
  }
}
