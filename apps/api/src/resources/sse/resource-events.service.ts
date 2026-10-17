import { Injectable, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { OnEvent } from '@nestjs/event-emitter';
import { ResourceEventPersistence } from '../persistence/port';
import { ResourceUsage } from '../../transport/models/resourceUsage.dto';
import { mapResponse } from '../../transport/response-mapper';
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

  constructor(private readonly persistence: ResourceEventPersistence) {}

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
    const exists = await this.persistence.exists(resourceId);
    if (!exists) throw new NotFoundException(`Resource with ID ${resourceId} not found`);

    // Allocate lazily: validation can finish after a connection has disconnected.
    return new Observable<MessageEvent>((subscriber) => {
      let subject = this.resourceSubjects.get(resourceId);
      if (!subject) {
        subject = new Subject<MessageEvent>();
        this.resourceSubjects.set(resourceId, subject);
      }
      let changed = false;
      const sub = subject.subscribe({
        next: (event) => {
          if ('inUse' in event.data) changed = true;
          subscriber.next(event);
        },
        complete: () => subscriber.complete(),
      });
      void this.getResourceInUseStatus(resourceId)
        .then((inUse) => {
          if (!subscriber.closed && !changed) {
            subscriber.next({ data: { resourceId, inUse, timestamp: new Date().toISOString() } });
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

  private async getResourceInUseStatus(resourceId: number): Promise<boolean> {
    const sessions = await this.persistence.sessionStates(resourceId);
    const activeUsage = sessions.find((usage) => usage.endTime === null && !usage.lifecyclePending);

    return !!activeUsage;
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
    this.emitToResource(resource.id, {
      usage: mapResponse(ResourceUsage, event.usage),
      inUse: true,
      eventType: ResourceSessionStartedEvent.EVENT_NAME,
    });
    this.logger.debug(`Emitted ${ResourceSessionStartedEvent.EVENT_NAME} event for resource ${resource.id}`);
  }

  @OnEvent(ResourceUsageSessionEndedEvent.EVENT_NAME)
  handleResourceSessionEnded(event: ResourceUsageSessionEndedEvent) {
    const resourceId = event.usage.resourceId;
    this.emitToResource(resourceId, {
      eventType: ResourceUsageSessionEndedEvent.EVENT_NAME,
      resourceId,
      inUse: false,
    });
    this.logger.debug(`Emitted ${ResourceUsageSessionEndedEvent.EVENT_NAME} event for resource ${resourceId}`);
  }

  @OnEvent(ResourceUsageSessionTakenOverEvent.EVENT_NAME)
  handleResourceUsageTakenOver(event: ResourceUsageSessionTakenOverEvent) {
    const resourceId = event.resource.id;
    this.emitToResource(resourceId, {
      eventType: ResourceUsageSessionTakenOverEvent.EVENT_NAME,
      resourceId,
      inUse: true,
    });
    this.logger.debug(`Emitted ${ResourceUsageSessionTakenOverEvent.EVENT_NAME} event for resource ${resourceId}`);
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
