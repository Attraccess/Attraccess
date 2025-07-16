import { Logger } from '@nestjs/common';
import { ReaderState } from './reader-state.interface';
import { NoResourcesAttachedState } from './no-resources-attached.state';
import { WaitForResourceSelectionState } from './wait-for-resource-selection.state';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType, AttractapResponse } from '../websocket.types';
import { verifyToken } from '../websocket.utils';
import { WaitForFirmwareUpdateState } from './wait-for-firmware-update.state';
import { AttractapFirmware } from '../../dtos/firmware.dto';

export class InitialReaderState implements ReaderState {
  private waitingForFirmwareInfo = false;

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

    switch (data.type) {
      case AttractapEventType.FIRMWARE_INFO:
        return await this.onFirmwareInfo(data);
    }
  }

  private async onIsAuthenticated(): Promise<void> {
    // refresh reader from database
    this.socket.reader = await this.services.attractapService.findReaderById(this.socket.reader.id);

    const authenticatedResponse = new AttractapResponse(AttractapEventType.READER_AUTHENTICATED, {
      name: this.socket.reader.name,
    });
    this.socket.sendMessage(authenticatedResponse);

    this.waitingForFirmwareInfo = true;
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.FIRMWARE_INFO, {}));
  }

  private async onFirmwareInfo(responseData: AttractapResponse['data']) {
    if (!this.waitingForFirmwareInfo) {
      return;
    }

    await this.services.attractapService.updateReaderFirmware(this.socket.reader.id, responseData.payload);

    const firmwareIsUpToDate = await this.isFirmwareLatest(responseData.payload);
    if (!firmwareIsUpToDate) {
      this.logger.debug('Firmware is not up to date, moving reader to WaitForFirmwareUpdateState');
      const nextState = new WaitForFirmwareUpdateState(this.socket, this.services);
      return this.socket.transitionToState(nextState);
    }

    if (this.socket.reader.resources.length === 0) {
      this.logger.debug('No resources attached to reader, moving reader to NoResourcesAttachedState');
      const nextState = new NoResourcesAttachedState(this.socket, this.services);
      return this.socket.transitionToState(nextState);
    }

    if (this.socket.reader.resources.length > 1) {
      this.logger.debug('Resources attached to reader, moving reader to WaitForResourceSelectionState');

      const nextState = new WaitForResourceSelectionState(this.socket, this.services);
      return this.socket.transitionToState(nextState);
    }

    this.logger.debug('Reader has only one resource attached, moving reader to WaitForNFCTapState');
    const nextState = new WaitForNFCTapState(this.socket, this.services, this.socket.reader.resources[0].id);
    return this.socket.transitionToState(nextState);
  }

  public async handleRegisterEvent(data: AttractapEvent['data']): Promise<void> {
    this.logger.debug('Received REGISTER event');
    const response = await this.services.attractapService.createNewReader(data.payload.firmware);

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

    const unauthorizedResponse = new AttractapEvent(AttractapEventType.UNAUTHORIZED, {
      message: 'PLEASE_REREGISTER',
    });

    this.logger.debug('Checking if reader exists');
    const reader = await this.services.attractapService.findReaderById(data.payload.id);
    if (!reader) {
      this.logger.error('No reader-config found for socket, sending UNAUTHORIZED response to client');
      return this.socket.sendMessage(unauthorizedResponse);
    }

    this.logger.debug('Checking if token is valid');
    const isValidToken = await verifyToken(data.payload.token, reader.apiTokenHash);
    if (!isValidToken) {
      this.logger.error('Invalid token, sending UNAUTHORIZED response to client');
      return this.socket.sendMessage(unauthorizedResponse);
    }

    this.socket.reader = reader;

    return this.onIsAuthenticated();
  }

  private async isFirmwareLatest(firmware: AttractapFirmware): Promise<boolean> {
    const firmwareDefinition = await this.services.firmwareService.getFirmwareDefinition(
      firmware.name,
      firmware.variant
    );

    if (!firmwareDefinition) {
      return true;
    }

    return String(firmwareDefinition.version) === String(firmware.version);
  }
}
