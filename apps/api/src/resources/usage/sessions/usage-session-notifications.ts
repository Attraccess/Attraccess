import { Resource, ResourceUsage, ResourceUsageAction, User } from '@attraccess/database-entities';

import { SystemEvent } from '@attraccess/plugins-backend-sdk';

import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';

import { EventEmitter2 } from '@nestjs/event-emitter';

import { InjectRepository } from '@nestjs/typeorm';

import { EntityManager, Repository } from 'typeorm';

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

import { emitPluginSessionEnded, emitPluginSessionStart } from '../events/plugin-usage-events';

import { RESOURCE_USAGE_LOG_CONTEXT } from '../lifecycle/usage-lifecycle';

import { type PreparedSessionStart } from './usage-session-start-preparation';

/** Charges, events, plugin events and metrics once a usage change has committed. */
@Injectable()
export class UsageSessionNotifications {
  private readonly logger = new Logger(RESOURCE_USAGE_LOG_CONTEXT);

  constructor(
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingService: BillingService,
    private readonly metricsService: MetricsService,
    private readonly pluginEvents: PluginEventsService,
    @Inject(forwardRef(() => ResourceFlowsExecutorService))
    private readonly flowExecutorService: ResourceFlowsExecutorService,
  ) {}

  async notifySessionStarted(
    resourceId: number,
    user: User,
    dto: StartUsageSessionDto,
    supervisorUserId: number | null,
    prepared: PreparedSessionStart,
    newSession: ResourceUsage,
    startedUsageIdToEmit: number | null,
    takeoverEndedUser: User | null,
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
        }),
      );
    }
  }

  async notifySessionEnded(
    resourceId: number,
    user: User,
    dto: EndUsageSessionDto,
    updatedUsage: ResourceUsage,
    endedUsageIdToEmit: number | null,
    activeSession: ResourceUsage | null,
    skipNoteNotification: boolean,
    chargeTransactionId: number | undefined,
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
            skipNoteNotification ? null : { id: user.id, username: user.username },
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
        }),
      );
    }
  }

  async emitUsageEvent(usageId: number, transactionalEntityManager?: EntityManager): Promise<void> {
    const resourceUsageRepository = transactionalEntityManager
      ? transactionalEntityManager.getRepository(ResourceUsage)
      : this.resourceUsageRepository;

    const usage = await resourceUsageRepository.findOne({
      where: { id: usageId },
      relations: ['resource', 'user'],
    });
    // An ended usage session is announced by ResourceUsageSessionEndedEvent (or the take-over event), never as a
    // start. Door actions are stored already ended and still fire this event.
    if (usage?.usageAction === ResourceUsageAction.Usage && usage.endTime) return;
    await this.eventEmitter.emitAsync(ResourceSessionStartedEvent.EVENT_NAME, new ResourceSessionStartedEvent(usage));
  }

  private emitSystemUsageEvent(
    event: SystemEvent.RESOURCE_USAGE_STARTED | SystemEvent.RESOURCE_USAGE_ENDED,
    resource: Resource | undefined,
    user: User | undefined,
  ): void {
    if (!resource || !user) {
      return;
    }
    try {
      this.pluginEvents.emit(event, { resource, user });
    } catch (error) {
      this.logger.error(`Failed to emit plugin SystemEvent ${event}`, (error as Error).stack);
    }
  }
}
