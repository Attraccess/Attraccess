import type { AutoEndReason } from '../session-duration/session-duration.rules';
import { ResourceUsageAction } from '@attraccess/application-models';
import type {
  ResourceRecord,
  UsageSession,
  UsageSessionUser,
  UsageSessionUserRecord,
  UserProfile,
} from '@attraccess/application-models';

import { SystemEvent } from '@attraccess/plugins-backend-sdk';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import type { TransactionScope } from '../../../database/unit-of-work';

import { BillingService } from '../../../billing/charges/billing.service';

import { MetricsService } from '../../../metrics/metrics.service';

import { PluginEventsService } from '../../../plugin-system/plugin-events.service';

import { ResourceFlowsExecutorService } from '../../flows/execution/resource-flows-executor.service';

import { EndUsageSessionDto } from '../dtos/endUsageSession.dto';

import { StartUsageSessionDto } from '../dtos/startUsageSession.dto';

import {
  ResourceSessionStartedEvent,
  ResourceSupervisedUsageEndedEvent,
  ResourceSupervisedUsageStartedEvent,
  ResourceUsageNoteAddedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../events/resource-usage.events';

import { emitPluginSessionEnded, emitPluginSessionStart, pluginUsageParties } from '../events/plugin-usage-events';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { USAGE_SESSION_STORE, UsageSessionStore } from '../usage-session-store.port';

import { type PreparedSessionStart } from './usage-session-start-preparation';

/** Charges, events, plugin events and metrics once a usage change has committed. */
@Injectable()
export class UsageSessionNotifications {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @Inject(USAGE_SESSION_STORE) private readonly sessions: UsageSessionStore,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    private readonly metricsService: MetricsService,
    private readonly pluginEvents: PluginEventsService,
    private readonly flowExecutorService: ResourceFlowsExecutorService,
  ) {}

  async notifySessionStarted(
    resourceId: number,
    user: UsageSessionUser,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    prepared: PreparedSessionStart,
    newSession: UsageSession,
    startedUsageIdToEmit: number | null,
    takeoverEndedUser: UsageSessionUserRecord | null,
    chargeTransactionId: number | undefined,
  ): Promise<void> {
    if (chargeTransactionId !== undefined) await this.billingService.notifyResourceUsageCharge(chargeTransactionId);
    this.flowExecutorService.trackResourceActivity(resourceId);

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
    if (newSession) {
      emitPluginSessionStart(this.pluginEvents, this.logger, {
        newSession,
        replacedSession: prepared.existingActiveSession ?? null,
        transitionTime: prepared.attempt.transitionTime,
        supervisorUserId,
      });
    }

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
          firstName: user.firstName,
          lastName: user.lastName,
        }),
      );
    }
  }

  async notifySessionEnded(
    resourceId: number,
    user: UsageSessionUser,
    dto: EndUsageSessionDto,
    updatedUsage: UsageSession,
    endedUsageIdToEmit: number | null,
    activeSession: UsageSession | null,
    skipNoteNotification: boolean,
    chargeTransactionId: number | undefined,
    autoEndReason?: AutoEndReason,
  ): Promise<void> {
    if (chargeTransactionId !== undefined) await this.billingService.notifyResourceUsageCharge(chargeTransactionId);
    this.emitSystemUsageEvent(SystemEvent.RESOURCE_USAGE_ENDED, updatedUsage?.resource, updatedUsage?.user);
    if (updatedUsage)
      emitPluginSessionEnded(this.pluginEvents, this.logger, updatedUsage, updatedUsage.endTime, 'ended');

    // Emitted after the transaction committed so listeners observe DB state. Every end fires it exactly once
    // (live feed, reader resource lists, maintenance evaluation); the notification listener skips self-ends.
    if (endedUsageIdToEmit && updatedUsage) {
      try {
        this.eventEmitter.emit(
          ResourceUsageSessionEndedEvent.EVENT_NAME,
          new ResourceUsageSessionEndedEvent(
            updatedUsage,
            skipNoteNotification
              ? null
              : { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName },
            autoEndReason,
          ),
        );
      } catch (error) {
        this.logger.error(`Failed to emit session ended event after endSession commit`, (error as Error).stack);
      }
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
          firstName: user.firstName,
          lastName: user.lastName,
        }),
      );
    }
  }

  async emitUsageEvent(usageId: number, context?: TransactionScope): Promise<void> {
    const usage = await this.sessions.findSessionForEvent(usageId, context);
    // An ended usage session is announced by ResourceUsageSessionEndedEvent (or the take-over event), never as a
    // start. Door actions are stored already ended and still fire this event.
    if (usage?.usageAction === ResourceUsageAction.Usage && usage.endTime) return;
    await this.eventEmitter.emitAsync(ResourceSessionStartedEvent.EVENT_NAME, new ResourceSessionStartedEvent(usage));
  }

  private emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: ResourceRecord | undefined,
    user: UserProfile | null | undefined,
  ): void {
    if (!resource || !user) {
      return;
    }
    try {
      this.pluginEvents.emit(event, pluginUsageParties(resource, user));
    } catch (error) {
      this.logger.error(`Failed to emit plugin SystemEvent ${event}`, (error as Error).stack);
    }
  }
}
