import { Injectable, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource, ResourceType } from '@attraccess/database-entities';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionEndedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../usage/events/resource-usage.events';
import { ResourceHealthChangedEvent } from '../health/events/resource-health-changed.event';

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

  /** Every payload carries the full slot state so consumers never infer "free" from a single ended session. */
  private async getResourceSessionStatus(
    resourceId: number,
  ): Promise<{ inUse: boolean; activeSessionCount: number; maxParallelSessions: number }> {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
      relations: ['usages'],
    });

    // Look for active usage sessions (those without an end time)
    const activeSessionCount =
      resource?.usages?.filter((usage) => usage.endTime === null && !usage.lifecyclePending).length ?? 0;
    const maxParallelSessions =
      resource?.type === ResourceType.Machine ? Math.max(1, resource.maxParallelSessions ?? 1) : 1;

    return { inUse: activeSessionCount > 0, activeSessionCount, maxParallelSessions };
  }

  // Slot state is read when the event is handled; handlers of one resource run in order so a slower
  // read can never overwrite a newer one on the wire.
  private readonly emitQueues = new Map<number, Promise<void>>();

  // Events queued per resource: an initial read that began earlier must not overwrite a newer queued event.
  private readonly queuedEvents = new Map<number, number>();

  private emitWithSessionStatus(resourceId: number, data: object): void {
    this.queuedEvents.set(resourceId, (this.queuedEvents.get(resourceId) ?? 0) + 1);
    const previous = this.emitQueues.get(resourceId) ?? Promise.resolve();
    const next = previous
      .then(async () => {
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

  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  handleResourceUsage(event: ResourceSessionStartedEvent) {
    const {
      usage: { resource },
    } = event;
    // This event also fires when a session ends (endTime set); report it as such.
    const eventType = event.usage.endTime
      ? ResourceUsageSessionEndedEvent.EVENT_NAME
      : ResourceSessionStartedEvent.EVENT_NAME;
    this.emitWithSessionStatus(resource.id, { ...event, eventType });
    this.logger.debug(`Queued ${eventType} event for resource ${resource.id}`);
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
    if (!this.resourceSubjects.has(event.resourceId)) {
      return;
    }
    const subject = this.resourceSubjects.get(event.resourceId);
    subject.next({
      data: {
        eventType: ResourceHealthChangedEvent.EVENT_NAME,
        resourceId: event.resourceId,
        identifier: event.identifier,
        status: event.status,
        reason: event.reason,
        previousStatus: event.previousStatus,
      },
    });
  }
}
