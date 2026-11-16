import { ResourceUsage } from '@attraccess/database-entities';
import { SystemEvent, SystemEventPayload } from '@attraccess/plugins-backend-sdk';
import type { Logger } from '@nestjs/common';
import type { PluginEventsService } from '../../../plugin-system/plugin-events.service';

type PluginUsageEvent =
  | SystemEvent.RESOURCE_USAGE_SESSION_STARTED
  | SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER
  | SystemEvent.RESOURCE_USAGE_SESSION_ENDED;

function emitSafely<E extends PluginUsageEvent>(
  pluginEvents: Pick<PluginEventsService, 'emit'>,
  logger: Pick<Logger, 'error'>,
  event: E,
  payload: SystemEventPayload[E],
): void {
  try {
    pluginEvents.emit(event, payload);
  } catch (error) {
    logger.error(`Failed to emit plugin SystemEvent ${event}`, (error as Error).stack);
  }
}

/** Emits RESOURCE_USAGE_SESSION_ENDED for a finished (or taken-over) session. Never throws. */
export function emitPluginSessionEnded(
  pluginEvents: Pick<PluginEventsService, 'emit'>,
  logger: Pick<Logger, 'error'>,
  session: Pick<ResourceUsage, 'id' | 'resourceId' | 'userId' | 'startTime'>,
  endTime: Date | null,
  reason: 'ended' | 'taken_over',
): void {
  emitSafely(pluginEvents, logger, SystemEvent.RESOURCE_USAGE_SESSION_ENDED, {
    resourceId: session.resourceId,
    usageId: session.id,
    userId: session.userId,
    startTime: session.startTime,
    endTime,
    reason,
  });
}

/**
 * Announces a committed session start. A takeover emits RESOURCE_USAGE_SESSION_TAKEN_OVER (for the new
 * user) plus RESOURCE_USAGE_SESSION_ENDED for the replaced session; a fresh start emits
 * RESOURCE_USAGE_SESSION_STARTED. Never throws.
 */
export function emitPluginSessionStart(
  pluginEvents: Pick<PluginEventsService, 'emit'>,
  logger: Pick<Logger, 'error'>,
  options: {
    newSession: Pick<ResourceUsage, 'id' | 'resourceId' | 'userId' | 'startTime'>;
    replacedSession: Pick<ResourceUsage, 'id' | 'resourceId' | 'userId' | 'startTime'> | null;
    transitionTime: Date;
    supervisorUserId: number | null;
  },
): void {
  const { newSession, replacedSession } = options;
  if (replacedSession) {
    emitSafely(pluginEvents, logger, SystemEvent.RESOURCE_USAGE_SESSION_TAKEN_OVER, {
      resourceId: newSession.resourceId,
      usageId: newSession.id,
      userId: newSession.userId,
      startTime: newSession.startTime,
      previousUsageId: replacedSession.id,
      previousUserId: replacedSession.userId,
    });
    emitPluginSessionEnded(pluginEvents, logger, replacedSession, options.transitionTime, 'taken_over');
    return;
  }
  emitSafely(pluginEvents, logger, SystemEvent.RESOURCE_USAGE_SESSION_STARTED, {
    resourceId: newSession.resourceId,
    usageId: newSession.id,
    userId: newSession.userId,
    startTime: newSession.startTime,
    supervisorUserId: options.supervisorUserId,
  });
}
