import { Logger } from '@nestjs/common';
import { ReaderState } from './reader-state.interface';
import { NoResourcesAttachedState } from './no-resources-attached.state';
import { WaitForResourceSelectionState } from './wait-for-resource-selection.state';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType, AttractapResponse } from '../websocket.types';
import { verifyToken } from '../websocket.utils';

export class InitialReaderState implements ReaderState {
  private readonly logger = new Logger(InitialReaderState.name);

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(forceInit = false) {
    if (forceInit === true) {
      this.socket.reader = null;
      this.socket.sendMessage(new AttractapEvent(AttractapEventType.REAUTHENTICATE, {}));
    }

    if (this.socket.reader) {
      return await this.onIsAuthenticated();
    }
  }

  public async onStateExit(): Promise<void> {
    return;
  }

  public async onEvent(data: AttractapEvent['data']): Promise<void> {
    switch (data.type) {
      case AttractapEventType.REGISTER:
        return await this.handleRegisterEvent(data);

      case AttractapEventType.AUTHENTICATE:
        return await this.handleAuthenticateEvent(data);

      default:
        this.logger.warn(`Received unknown event type: ${data.type}`);
        return undefined;
    }
  }

  public async onResponse(data: AttractapResponse['data']): Promise<void> {
    this.logger.debug(`Received response: ${JSON.stringify(data)}`);
  }

  private async onIsAuthenticated(): Promise<void> {
    this.logger.debug('Getting resources of reader', this.socket.reader.hasAccessToResourceIds);
    const resourcesOfReader = await this.services.resourcesService.getResourceById(
      this.socket.reader.hasAccessToResourceIds
    );
    if (resourcesOfReader.length === 0) {
      this.logger.debug('No resources attached to reader, moving reader to NoResourcesAttachedState');
      const nextState = new NoResourcesAttachedState(this.socket, this.services);
      return this.socket.transitionToState(nextState);
    }

    if (resourcesOfReader.length > 1) {
      this.logger.debug('Resources attached to reader, moving reader to WaitForResourceSelectionState');

      const nextState = new WaitForResourceSelectionState(this.socket, this.services, resourcesOfReader);
      return this.socket.transitionToState(nextState);
    }

    this.logger.debug('Reader has only one resource attached, moving reader to WaitForNFCTapState');
    const nextState = new WaitForNFCTapState(this.socket, this.services, resourcesOfReader[0].id);
    return this.socket.transitionToState(nextState);
  }

  public async handleRegisterEvent(data: AttractapEvent['data']): Promise<void> {
    this.logger.debug('Received REGISTER event');
    const response = await this.services.attractapService.createNewReader();

    this.logger.debug(
      `Sending REGISTER response to client. Reader ID: ${response.reader.id}, Token: ${response.token}`
    );

    this.socket.sendMessage(
      AttractapResponse.fromEventData(data, {
        id: response.reader.id,
        token: response.token,
      })
    );
  }

  public async handleAuthenticateEvent(data: AttractapEvent['data']): Promise<void> {
    this.logger.debug('processing AUTHENTICATE event', data);

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.UNAUTHORIZED, {});

    const reader = await this.services.attractapService.findReaderById(data.payload.id);
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return this.socket.sendMessage(unauthorizedResponse);
    }

    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return this.socket.sendMessage(unauthorizedResponse);
    }

    const authenticatedResponse = new AttractapResponse(AttractapEventType.READER_AUTHENTICATED, {
      name: reader.name,
    });
    this.socket.sendMessage(authenticatedResponse);

    this.socket.reader = reader;

    return this.onIsAuthenticated();
  }
}
