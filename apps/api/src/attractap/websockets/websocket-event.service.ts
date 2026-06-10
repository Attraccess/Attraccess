import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { ResourceUsageEvent, ResourceUsageTakenOverEvent } from '../../resources/usage/events/resource-usage.events';
import { ResourceChangedEvent } from '../../resources/events/resource-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceFlowChangedEvent } from '../../resources/flows/events/resource-flow-changed.event';
import { ResourceHealthChangedEvent } from '../../resources/health/events/resource-health-changed.event';

@Injectable()
export class WebSocketEventService {
  private readonly logger = new Logger(WebSocketEventService.name);

  @Inject(AttractapGateway)
  private readonly attractapGateway: AttractapGateway;

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  public async onReaderUpdated(event: ReaderUpdatedEvent) {
    this.logger.debug('Got reader updated event');
    this.attractapGateway.sendResourceList(event.reader.id);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  public async onReaderDeleted(event: ReaderDeletedEvent) {
    this.logger.debug('Got reader deleted event');
    this.attractapGateway.disconnectReader(event.readerId);
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  public async onResourceUsage(event: ResourceUsageEvent) {
    this.logger.debug('Got resource usage started event');
    this.attractapGateway.sendResourceListToReadersWithResource(event.usage.resource.id);
  }

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  public async onResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    this.logger.debug('Got resource usage ended event');
    this.attractapGateway.sendResourceListToReadersWithResource(event.resource.id);
  }

  @OnEvent(ResourceChangedEvent.EVENT_NAME)
  @OnEvent(ResourceFlowChangedEvent.EVENT_NAME)
  public async onResourceChanged(event: ResourceChangedEvent) {
    this.attractapGateway.sendResourceListToReadersWithResource(event.resourceId);
  }

  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  public async onResourceMaintenanceChanged(event: ResourceMaintenanceChangedEvent) {
    this.logger.debug({ resourceId: event.resourceId }, 'Got resource maintenance changed event');
    this.attractapGateway.sendResourceListToReadersWithResource(event.resourceId);
  }

  @OnEvent(ResourceHealthChangedEvent.EVENT_NAME)
  public async onResourceHealthChanged(event: ResourceHealthChangedEvent) {
    this.logger.debug({ resourceId: event.resourceId }, 'Got resource health changed event');
    this.attractapGateway.sendResourceListToReadersWithResource(event.resourceId);
  }
}
