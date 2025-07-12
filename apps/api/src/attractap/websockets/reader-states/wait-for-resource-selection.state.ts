import { Logger } from '@nestjs/common';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';
import { Resource } from '@attraccess/plugins-backend-sdk';

export class WaitForResourceSelectionState implements ReaderState {
  private readonly logger = new Logger(WaitForResourceSelectionState.name);
  private value = '';

  public constructor(
    private readonly socket: AuthenticatedWebSocket,
    private readonly services: GatewayServices,
    private readonly resourcesOfReader: Resource[]
  ) {}

  public async onStateEnter(): Promise<void> {
    this.updateDisplay();
  }

  public updateDisplay() {
    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.SHOW_TEXT, {
        lineOne: 'Select a resource',
        lineTwo: `> ${this.value} <`,
      })
    );
  }

  public async onStateExit(): Promise<void> {
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.HIDE_TEXT));
  }

  public async onEvent(data: AttractapEvent['data']) {
    if (data.type === AttractapEventType.KEY_PRESSED) {
      return await this.onKeyPressed(data.payload);
    }

    return undefined;
  }

  public async onResponse(/* data: AttractapResponse<{ selection: number }>['data'] */) {
    return undefined;
  }

  private async onKeyPressed(data: AttractapEvent['data']['payload']) {
    if (data.key === '#') {
      this.logger.debug('Confirming value', this.value);
      return await this.onValueConfirmed();
    }

    if (data.key === '*') {
      this.logger.debug('Removing last character', this.value);
      this.value = this.value.slice(0, -1);
    }

    if (data.key === 'D') {
      this.logger.debug('Clearing input', this.value);
      this.value = '';
    }

    this.logger.debug('Adding character', data.key, this.value);
    this.value += data.key;
    return this.updateDisplay();
  }

  private async onValueConfirmed() {
    const selectedResourceId = parseInt(this.value, 10);

    if (isNaN(selectedResourceId)) {
      this.logger.error('Selected resource id is not a number, clearing input', {
        value: this.value,
        intValue: selectedResourceId,
      });
      this.value = '';
      return this.updateDisplay();
    }

    const resource = this.resourcesOfReader.find((resource) => resource.id === selectedResourceId);

    if (!resource) {
      this.logger.error('Resource with id not found', selectedResourceId);
      this.value = '';

      this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Unknown resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

      return await this.updateDisplay();
    }

    this.socket.sendMessage(new AttractapEvent(AttractapEventType.HIDE_TEXT));

    this.logger.debug(`Reader has selected resource with id ${selectedResourceId}, moving to WaitForNFCTapState`);
    const nextState = new WaitForNFCTapState(
      this.socket,
      this.services,
      selectedResourceId,
      30000,
      new WaitForResourceSelectionState(this.socket, this.services, this.resourcesOfReader),
      new WaitForResourceSelectionState(this.socket, this.services, this.resourcesOfReader)
    );
    return await this.socket.transitionToState(nextState);
  }
}
