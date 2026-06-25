import {
  Controller,
  Param,
  Sse,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ParseIntPipe,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from '@attraccess/database-entities';
import { ResourceUsageEvent, ResourceSessionEndedEvent, ResourceUsageTakenOverEvent } from '../usage/events/resource-usage.events';
import { ResourceHealthChangedEvent } from '../health/events/resource-health-changed.event';
import { ApiTags } from '@nestjs/swagger';
import { SseInstrumentation } from '../../metrics/instrumentation/sse/sse.helper';

interface MessageEvent {
  data: object;
}

@ApiTags('Resources')
@Controller('resources')
export class SSEController implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SSEController.name);
  private keepAliveInterval: NodeJS.Timeout;

  // Create subjects for each resource id
  private resourceSubjects: Map<number, Subject<MessageEvent>> = new Map();

  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
    private readonly sse: SseInstrumentation,
  ) {}

  onModuleInit() {
    // Send keep-alive messages every 30 seconds to prevent connection timeouts
    this.keepAliveInterval = setInterval(() => {
      // For each resource subject, emit a keep-alive event
      this.resourceSubjects.forEach((subject) => {
        subject.next({ data: { keepalive: true } });
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

  @Sse(':resourceId/events')
  async streamEvents(@Param('resourceId', ParseIntPipe) resourceId: number): Promise<Observable<MessageEvent>> {
    // Verify resource exists
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException(`Resource with ID ${resourceId} not found`);
    }

    // Create a subject for this resource if it doesn't exist
    if (!this.resourceSubjects.has(resourceId)) {
      this.resourceSubjects.set(resourceId, new Subject<MessageEvent>());
    }

    // Get the subject for this resource
    const subject = this.resourceSubjects.get(resourceId);

    this.logger.log(`Client connected to SSE for resource ${resourceId}`);

    // Send initial state immediately
    setTimeout(async () => {
      const isInUse = await this.getResourceInUseStatus(resourceId);
      subject.next({
        data: {
          resourceId,
          inUse: isInUse,
          timestamp: new Date().toISOString(),
        },
      });
    }, 1000);

    // Create an observable from the subject
    return this.sse.wrap('resource_usage', subject.asObservable());
  }

  private async getResourceInUseStatus(resourceId: number): Promise<boolean> {
    // Check if resource has an active usage session (no endTime)
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
      relations: ['usages'],
    });

    if (!resource) {
      return false;
    }

    // Look for active usage sessions (those without an end time)
    const activeUsage = resource.usages?.find((usage) => usage.endTime === null);

    return !!activeUsage;
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  handleResourceUsage(event: ResourceUsageEvent) {
    const {
      usage: { resource },
    } = event;

    // Check if we have any subscribers for this resource
    if (!this.resourceSubjects.has(resource.id)) {
      return;
    }

    // Get the subject for this resource
    const subject = this.resourceSubjects.get(resource.id);

    // Create event data with inUse flag
    const eventData = {
      ...event,
      inUse: true,
      eventType: ResourceUsageEvent.EVENT_NAME,
    };

    // Emit the event to all subscribers
    subject.next({ data: eventData });

    this.logger.debug(`Emitted ${ResourceUsageEvent.EVENT_NAME} event for resource ${resource.id}`);
  }

  @OnEvent(ResourceSessionEndedEvent.EVENT_NAME)
  handleResourceSessionEnded(event: ResourceSessionEndedEvent) {
    const resourceId = event.usage.resourceId;
    if (!this.resourceSubjects.has(resourceId)) {
      return;
    }
    this.resourceSubjects.get(resourceId).next({
      data: {
        eventType: ResourceSessionEndedEvent.EVENT_NAME,
        resourceId,
        inUse: false,
      },
    });
  }

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  handleResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    const resourceId = event.resource.id;
    if (!this.resourceSubjects.has(resourceId)) {
      return;
    }
    this.resourceSubjects.get(resourceId).next({
      data: {
        eventType: ResourceUsageTakenOverEvent.EVENT_NAME,
        resourceId,
        inUse: true,
      },
    });
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
