import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../../resources/usage/events/resource-usage.events';
import { ResourceChangedEvent } from '../../resources/events/resource-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceFlowChangedEvent } from '../../resources/flows/events/resource-flow-changed.event';
import { ResourceHealthChangedEvent } from '../../resources/health/events/resource-health-changed.event';
import { ResourceIntroducerChangedEvent } from '../../resources/introducers/events/resource-introducer-changed.event';
import { ResourceGroupIntroducerChangedEvent } from '../../resources/groups/introducers/events/resource-group-introducer-changed.event';
import { ResourceGroupIntroductionChangedEvent } from '../../resources/groups/introductions/events/resource-group-introduction-changed.event';
import { ResourceGroupsService } from '../../resources/groups/resourceGroups.service';

@Injectable()
export class WebSocketEventService {
  private readonly logger = new Logger(WebSocketEventService.name);

  @Inject(AttractapGateway)
  private readonly attractapGateway: AttractapGateway;

  @Inject(ResourceGroupsService)
  private readonly resourceGroupsService: ResourceGroupsService;

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

  @OnEvent(ResourceSessionStartedEvent.EVENT_NAME)
  public async onResourceUsage(event: ResourceSessionStartedEvent) {
    this.logger.debug('Got resource usage started event');
    this.attractapGateway.sendResourceListToReadersWithResource(event.usage.resource.id);
  }

  @OnEvent(ResourceUsageSessionTakenOverEvent.EVENT_NAME)
  public async onResourceUsageTakenOver(event: ResourceUsageSessionTakenOverEvent) {
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

  @OnEvent(ResourceIntroducerChangedEvent.EVENT_NAME)
  public async onResourceIntroducerChanged(event: ResourceIntroducerChangedEvent) {
    await this.attractapGateway.sendResourceListToReadersWithResource(event.resourceId);
  }

  @OnEvent(ResourceGroupIntroducerChangedEvent.EVENT_NAME)
  public async onResourceGroupIntroducerChanged(event: ResourceGroupIntroducerChangedEvent) {
    await this.refreshResourcesForGroup(event.resourceGroupId);
  }

  @OnEvent(ResourceGroupIntroductionChangedEvent.EVENT_NAME)
  public async onResourceGroupIntroductionChanged(event: ResourceGroupIntroductionChangedEvent) {
    if (event.affectedResourceIds) {
      await Promise.all(
        event.affectedResourceIds.map((resourceId) => this.attractapGateway.sendResourceListToReadersWithResource(resourceId)),
      );
      return;
    }

    await this.refreshResourcesForGroup(event.resourceGroupId);
  }

  private async refreshResourcesForGroup(resourceGroupId: number) {
    const group = await this.resourceGroupsService.getOne({ id: resourceGroupId }, ['resources']);
    await Promise.all(
      group.resources.map((resource) => this.attractapGateway.sendResourceListToReadersWithResource(resource.id)),
    );
  }
}
