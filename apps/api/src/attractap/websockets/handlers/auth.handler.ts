import { Inject, Injectable, Logger } from '@nestjs/common';
import { AttractapService } from '../../attractap.service';
import { verifyToken } from '../websocket.utils';
import { ResourceListService } from './resource-list.service';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';

@Injectable()
export class AttractapAuthHandler {
  private readonly logger = new Logger(AttractapAuthHandler.name);

  @Inject(AttractapService)
  private attractapService: AttractapService;

  @Inject(ResourceListService)
  private resourceListService: ResourceListService;

  public async handleReaderRegister(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('Received REGISTER event');
    const response = await this.attractapService.createNewReader(data.payload.firmware);

    this.logger.debug(
      `Sending REGISTER response to client. Reader ID: ${response.reader.id}, Token: ${response.token}`,
    );

    await socket.sendMessage(
      new AttractapEvent(AttractapEventType.READER_REGISTER, {
        id: response.reader.id,
        token: response.token,
      }),
    );
  }

  public async handleAuthentication(socket: AuthenticatedWebSocket, data: AttractapEvent['data']) {
    this.logger.debug('processing READER_AUTHENTICATE event', data);

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.READER_UNAUTHORIZED, {
      message: 'PLEASE_REREGISTER',
    });

    this.logger.debug('Checking if reader exists');
    const reader = await this.attractapService.findReaderById(data.payload.id);
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return await socket.sendMessage(unauthorizedResponse);
    }

    socket.readerId = reader.id;

    const authenticatedResponse = new AttractapEvent(AttractapEventType.READER_AUTHENTICATED, {
      name: reader.name,
    });
    await socket.sendMessage(authenticatedResponse);

    await this.resourceListService.sendResourceListToSocket(socket);
  }
}
