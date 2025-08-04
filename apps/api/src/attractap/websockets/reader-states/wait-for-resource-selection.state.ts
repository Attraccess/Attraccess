import { Logger } from '@nestjs/common';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';

export class WaitForResourceSelectionState implements ReaderState {
  private readonly logger = new Logger(WaitForResourceSelectionState.name);
  private value = '';

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(clearValue = true): Promise<void> {
    if (clearValue) {
      this.value = '';

      if (this.socket.reader.resources.length === 1) {
        this.value = '1';
      }
    }

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.SELECT_ITEM, {
        label: 'Select a resource',
        selectedValue: this.value,
        options: this.socket.reader.resources.map((resource, index) => ({
          id: String(index + 1),
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

    if (data.type === AttractapEventType.READER_KEY_PRESSED) {
      return await this.onKeyPressed(data.payload);
    }

    return undefined;
  }

  public async onResponse(/* data: AttractapResponse<{ selection: number }>['data'] */) {
    return undefined;
  }

  private async onSelectItem(data: AttractapEvent<{ selectedId: string }>['data']['payload']) {
    const selectedResourceIndex = Number(data.selectedId);

    if (isNaN(selectedResourceIndex)) {
      this.logger.error('Selected resource index is not a number, clearing input', {
        value: this.value,
        intValue: selectedResourceIndex,
      });

      await this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Invalid resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

      return await this.onStateEnter(true);
    }

    const resource = this.socket.reader.resources[selectedResourceIndex - 1];

    if (!resource) {
      this.logger.error(
        'Resource with id not found',
        selectedResourceIndex,
        this.socket.reader.resources.map((r) => r.id),
        typeof selectedResourceIndex
      );
      this.value = '';

      await this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Unknown resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

      return await this.onStateEnter(true);
    }

    this.logger.debug(`Reader has selected resource with index ${selectedResourceIndex}, moving to WaitForNFCTapState`);
    const nextState = new WaitForNFCTapState(
      this.socket,
      this.services,
      resource.id,
      30000,
      new WaitForResourceSelectionState(this.socket, this.services),
      new WaitForResourceSelectionState(this.socket, this.services)
    );
    return await this.socket.transitionToState(nextState);
  }

  private async onKeyPressed(data: AttractapEvent<{ key: string }>['data']['payload']) {
    this.logger.debug('Key pressed', data);

    if (data.key === 'CONFIRM') {
      await this.onSelectItem({ selectedId: this.value });
      return;
    }

    if (data.key === 'CLEAR') {
      await this.onStateEnter(true);
      return;
    }

    if (this.socket.reader.resources.length > 1) {
      this.value += data.key;
    }

    await this.onStateEnter(false);
  }
}
