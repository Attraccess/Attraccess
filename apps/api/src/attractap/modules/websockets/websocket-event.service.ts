import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AttractapGateway } from './websocket.gateway';
import { ReaderUpdatedEvent } from '../../events';

@Injectable()
export class WebSocketEventService {
  private readonly logger = new Logger(WebSocketEventService.name);

  @Inject(AttractapGateway)
  private readonly attractapGateway: AttractapGateway;

  @OnEvent('reader.updated')
  public async onReaderUpdated(event: ReaderUpdatedEvent) {
    this.logger.debug('Got reader updated event', event);
    await this.attractapGateway.restartReader(event.reader.id);
  }
}
