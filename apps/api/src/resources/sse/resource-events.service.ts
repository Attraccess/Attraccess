import { Injectable, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceUsage } from '@attraccess/database-entities';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../usage/events/resource-usage.events';
import { ResourceHealthChangedEvent } from '../health/events/resource-health-changed.event';
import { activeUsageWhere, getSessionCapacity } from '../usage/sessions/active-usage';

interface MessageEvent {
  data: object;
}

@Injectable()
export class ResourceEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ResourceEventsService.name);
  private keepAliveInterval: NodeJS.Timeout;

  // Create subjects for each resource id
  private resourceSubjects: Map<number, Subject<MessageEvent>> = new Map();

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    @InjectRepository(ResourceUsage)
    private readonly resourceUsageRepository: Repository<ResourceUsage>,
  ) {}

  onModuleInit() {
    // Send keep-alive messages every 10 seconds to prevent connection timeouts
    this.keepAliveInterval = setInterval(() => {
      // For each resource subject, emit a keep-alive event; prune dead subjects
      this.resourceSubjects.forEach((subject, id) => {
        if (subject.observed) {
          subject.next({ data: { keepalive: true } });
        } else {
          this.resourceSubjects.delete(id);
        }
      });
    }, 10000);
  }

  onModuleDestroy() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }

    // Complete all subjects when the module is destroyed
    this.resourceSubjects.forEach((subject) => subject.complete());
  }

  async subscribeResource(resourceId: number): Promise<Observable<MessageEvent>> {
    const resource = await this.resourceRepository.findOne({ where: { id: resourceId } });
    if (!resource) throw new NotFoundException(`Resource with ID ${resourceId} not found`);

    // Allocate lazily: validation can finish after a connection has disconnected.
    return new Observable<MessageEvent>((subscriber) => {
      let subject = this.resourceSubjects.get(resourceId);
      if (!subject) {
        subject = new Subject<MessageEvent>();
        this.resourceSubjects.set(resourceId, subject);
      }
      let changed = false;
      const queuedAtSubscribe = this.queuedEvents.get(resourceId) ?? 0;
      const sub = subject.subscribe({
        next: (event) => {
          if ('inUse' in event.data) changed = true;
          subscriber.next(event);
        },
        complete: () => subscriber.complete(),
      });
      void this.getResourceSessionStatus(resourceId)
        .then((status) => {
          if (!subscriber.closed && !changed && (this.queuedEvents.get(resourceId) ?? 0) === queuedAtSubscribe) {
            subscriber.next({ data: { resourceId, ...status, timestamp: new Date().toISOString() } });
          }
        })
        .catch((error) => subscriber.error(error));
      return () => {
        sub.unsubscribe();
        if (!subject.observed && this.resourceSubjects.get(resourceId) === subject) {
          this.resourceSubjects.delete(resourceId);
        }
      };
    });
  }

  /**
   * Every payload carries the full slot state so consumers never infer "free" from a single ended session.
   * Counts the same sessions as GET usage/active: published usage sessions only.
   */
  private async getResourceSessionStatus(
    resourceId: number,
  ): Promise<{ inUse: boolean; activeSessionCount: number; maxParallelSessions: number }> {
    const [resource, activeSessionCount] = await Promise.all([
      this.resourceRepository.findOne({
        where: { id: resourceId },
        select: { id: true, type: true, maxParallelSessions: true },
      }),
      this.resourceUsageRepository.count({ where: { resourceId, ...activeUsageWhere() } }),
    ]);
    const maxParallelSessions = resource ? getSessionCapacity(resource, activeSessionCount).maxParallelSessions : 1;

    return { inUse: activeSessionCount > 0, activeSessionCount, maxParallelSessions };
  }

  // Slot state is read when the event is handled; handlers of one resource run in order so a slower
  // read can never overwrite a newer one on the wire.
  private readonly emitQueues = new Map<number, Promise<void>>();

  // Events queued per resource: an initial read that began earlier must not overwrite a newer queued event.
  private readonly queuedEvents = new Map<number, number>();

  private isObserved(resourceId: number): boolean {
    return this.resourceSubjects.get(resourceId)?.observed ?? false;
  }

  private emitWithSessionStatus(resourceId: number, data: object): void {
    // Nobody listens: no slot state to read. A later subscriber reads its own initial state.
    if (!this.isObserved(resourceId)) return;
    this.queuedEvents.set(resourceId, (this.queuedEvents.get(resourceId) ?? 0) + 1);
    const previous = this.emitQueues.get(resourceId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
        // The last subscriber may have left while this event waited in the queue.
        if (!this.isObserved(resourceId)) return;
        const status = await this.getResourceSessionStatus(resourceId);
        this.emitToResource(resourceId, { ...data, ...status });
      })
      .catch((error) => this.logger.warn(`Failed to emit session state for resource ${resourceId}: ${error.message}`))
      .finally(() => {
        if (this.emitQueues.get(resourceId) === next) this.emitQueues.delete(resourceId);
      });
    this.emitQueues.set(resourceId, next);
  }

  private emitToResource(resourceId: number, data: object): void {
    const subject = this.resourceSubjects.get(resourceId);
    if (!subject) return;
    subject.next({ data });
  }

  /** Fires on session starts and door actions only; ends arrive as session_ended or session_taken_over. */
  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  handleResourceUsage(event: ResourceSessionStartedEvent) {
    const resourceId = event.usage.resource.id;
    this.emitWithSessionStatus(resourceId, { ...event, eventType: ResourceSessionStartedEvent.EVENT_NAME });
    this.logger.debug(`Queued ${ResourceSessionStartedEvent.EVENT_NAME} event for resource ${resourceId}`);
  }

  @OnEvent(ResourceUsageSessionEndedEvent.EVENT_NAME)
  handleResourceSessionEnded(event: ResourceUsageSessionEndedEvent) {
    const resourceId = event.usage.resourceId;
    this.emitWithSessionStatus(resourceId, {
      eventType: ResourceUsageSessionEndedEvent.EVENT_NAME,
      resourceId,
      // Lets the live-feed filter hand this to the session's owner even when they may not see other activity.
      ownerUserId: event.usage.userId,
    });
    this.logger.debug(`Queued ${ResourceUsageSessionEndedEvent.EVENT_NAME} event for resource ${resourceId}`);
  }

  @OnEvent(ResourceUsageSessionTakenOverEvent.EVENT_NAME)
  handleResourceUsageTakenOver(event: ResourceUsageSessionTakenOverEvent) {
    const resourceId = event.resource.id;
    this.emitWithSessionStatus(resourceId, {
      eventType: ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      resourceId,
      // The previous owner learns their session is gone; the new owner's name is never part of the event.
      ownerUserId: event.previousUser?.id,
    });
    this.logger.debug(`Queued ${ResourceUsageSessionTakenOverEvent.EVENT_NAME} event for resource ${resourceId}`);
  }

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  handleResourceHealthChanged(event: ResourceHealthChangedEvent) {
    this.emitWithSessionStatus(event.resourceId, {
      eventType: ResourceHealthChangedEvent.EVENT_NAME,
      resourceId: event.resourceId,
      identifier: event.identifier,
      status: event.status,
      reason: event.reason,
      previousStatus: event.previousStatus,
    });
  }
}
