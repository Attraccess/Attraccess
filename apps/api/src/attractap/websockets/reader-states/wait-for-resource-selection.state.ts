import { Logger } from '@nestjs/common';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';

export class WaitForResourceSelectionState implements ReaderState {
  private readonly logger = new Logger(WaitForResourceSelectionState.name);
  private value = '';

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.SELECT_ITEM, {
        label: 'Select a resource',
        options: this.socket.reader.resources.map((resource) => ({
          id: resource.id,
          label: resource.name,
        })),
      })
    );
  }

  public async onStateExit(): Promise<void> {
    // nothing to do here
  }

  public async onEvent(data: AttractapEvent['data']) {
    if (data.type === AttractapEventType.SELECT_ITEM) {
      return await this.onSelectItem(data.payload);
    }

    return undefined;
  }

  public async onResponse(/* data: AttractapResponse<{ selection: number }>['data'] */) {
    return undefined;
  }

  private async onSelectItem(data: AttractapEvent['data']['payload']) {
    const selectedResourceId = Number(data.selectedId);

    if (isNaN(selectedResourceId)) {
      this.logger.error('Selected resource id is not a number, clearing input', {
        value: this.value,
        intValue: selectedResourceId,
      });

      this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Invalid resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

      return this.onStateEnter();
    }

    const resource = this.socket.reader.resources.find((resource) => resource.id === selectedResourceId);

    if (!resource) {
      this.logger.error(
        'Resource with id not found',
        selectedResourceId,
        this.socket.reader.resources.map((r) => r.id),
        typeof selectedResourceId
      );
      this.value = '';

      this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Unknown resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

      return await this.onStateEnter();
    }

    this.logger.debug(`Reader has selected resource with id ${selectedResourceId}, moving to WaitForNFCTapState`);
    const nextState = new WaitForNFCTapState(
      this.socket,
      this.services,
      selectedResourceId,
      30000,
      new WaitForResourceSelectionState(this.socket, this.services),
      new WaitForResourceSelectionState(this.socket, this.services)
    );
    return await this.socket.transitionToState(nextState);
  }
}
