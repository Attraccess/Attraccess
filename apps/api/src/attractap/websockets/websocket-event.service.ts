import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { ResourceUsageEvent, ResourceUsageTakenOverEvent } from '../../resources/usage/events/resource-usage.events';

@Injectable()
export class WebSocketEventService {
  private readonly logger = new Logger(WebSocketEventService.name);

  @Inject(AttractapGateway)
  private readonly attractapGateway: AttractapGateway;

  @OnEvent(ReaderUpdatedEvent.EVENT_NAME)
  public async onReaderUpdated(event: ReaderUpdatedEvent) {
    this.logger.debug('Got reader updated event', event);
    await this.attractapGateway.restartReader(event.reader.id);
  }

  @OnEvent(ReaderDeletedEvent.EVENT_NAME)
  public async onReaderDeleted(event: ReaderDeletedEvent) {
    this.logger.debug('Got reader deleted event', event);
    await this.attractapGateway.restartReader(event.readerId);
  }

  @OnEvent(ResourceUsageEvent.EVENT_NAME)
  public async onResourceUsage(event: ResourceUsageEvent) {
    this.logger.debug('Got resource usage started event', event);
    this.attractapGateway.onResourceUsageChanged(event.usage.resource.id);
  }

  @OnEvent(ResourceUsageTakenOverEvent.EVENT_NAME)
  public async onResourceUsageTakenOver(event: ResourceUsageTakenOverEvent) {
    this.logger.debug('Got resource usage ended event', event);
    this.attractapGateway.onResourceUsageChanged(event.resource.id);
  }
}
