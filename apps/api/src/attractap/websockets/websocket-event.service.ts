import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { ResourceUsageEvent, ResourceUsageTakenOverEvent } from '../../resources/usage/events/resource-usage.events';
import { ResourceChangedEvent } from '../../resources/events/resource-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceGroupIntroductionChangedEvent } from '../../resources/groups/introductions/events/resource-group-introduction-changed.event';
import { ResourceGroupIntroducerChangedEvent } from '../../resources/groups/introducers/events/resource-group-introducer-changed.event';
import { ResourceIntroductionChangedEvent } from '../../resources/introductions/events/resource-introduction-changed.event';
import { ResourceBillingConfigurationChangedEvent } from '../../billing/events/resource-billing-configuration-changed.event';
import { ResourceIntroducerChangedEvent } from '../../resources/introducers/events/resource-introducer-changed.event';

@Injectable()
export class WebSocketEventService {
  private readonly logger = new Logger(WebSocketEventService.name);

  @Inject(AttractapGateway)
  private readonly attractapGateway: AttractapGateway;

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  public async onReaderUpdated(event: ReaderUpdatedEvent) {
    this.logger.debug('Got reader updated event', event);
    // TODO: inform reader about name change etc
    this.attractapGateway.sendResourceList(event.reader.id);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  public async onReaderDeleted(event: ReaderDeletedEvent) {
    this.logger.debug('Got reader deleted event', event);
    this.attractapGateway.disconnectReader(event.readerId);
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  public async onResourceUsage(event: ResourceUsageEvent) {
    this.logger.debug('Got resource usage started event', event);
    this.attractapGateway.sendResourceListToReadersWithResource(event.usage.resource.id);
  }

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  public async onResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    this.logger.debug('Got resource usage ended event', event);
    this.attractapGateway.sendResourceListToReadersWithResource(event.resource.id);
  }

  @OnEvent(ResourceChangedEvent.EVENT_NAME)
  public async onResourceChanged(event: ResourceChangedEvent) {
    this.attractapGateway.sendResourceListToReadersWithResource(event.resourceId);
  }

  @OnEvent(ResourceMaintenanceChangedEvent.EVENT_NAME)
  public async onResourceMaintenanceChanged(event: ResourceMaintenanceChangedEvent) {
    // TODO: implement
  }

  @OnEvent(ResourceGroupIntroductionChangedEvent.EVENT_NAME)
  public async onResourceGroupIntroductionChanged(event: ResourceGroupIntroductionChangedEvent) {
    // TODO: implement
  }

  @OnEvent(ResourceGroupIntroducerChangedEvent.EVENT_NAME)
  public async onResourceGroupIntroducerChanged(event: ResourceGroupIntroducerChangedEvent) {
    // TODO: implement
  }

  @OnEvent(ResourceIntroductionChangedEvent.EVENT_NAME)
  public async onResourceIntroductionChanged(event: ResourceIntroductionChangedEvent) {
    // TODO: implement
  }

  @OnEvent(ResourceBillingConfigurationChangedEvent.EVENT_NAME)
  public async onResourceBillingConfigurationChanged(event: ResourceBillingConfigurationChangedEvent) {
    // TODO: implement
  }

  @OnEvent(ResourceIntroducerChangedEvent.EVENT_NAME)
  public async onResourceIntroducerChanged(event: ResourceIntroducerChangedEvent) {
    // TODO: implement
  }
}
