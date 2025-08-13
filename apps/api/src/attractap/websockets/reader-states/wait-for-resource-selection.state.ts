import { Logger } from '@nestjs/common';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType, AttractapResponse } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { WaitForNFCTapState } from './wait-for-nfc-tap.state';
import { GatewayServices } from '../websocket.gateway';
import { InitialReaderState } from './initial.state';

export class WaitForResourceSelectionState implements ReaderState {
  private readonly logger = new Logger(WaitForResourceSelectionState.name);

  public constructor(private readonly socket: AuthenticatedWebSocket, private readonly services: GatewayServices) {}

  public async onStateEnter(): Promise<void> {
    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.SELECT_ITEM, {
        itemType: 'resource',
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

  public async onEvent(_data: AttractapEvent['data']): Promise<void> {
    void _data;
    return;
  }

  public async onResponse(data: AttractapResponse['data']) {
    if (data.type === AttractapEventType.SELECT_ITEM) {
      return await this.onSelectItem(data.payload);
    }

    return undefined;
  }

  private async onSelectItem(data: AttractapEvent<{ value: string }>['data']['payload']) {
    const selectedResourceIndex = Number(data.value);

    if (isNaN(selectedResourceIndex)) {
      this.logger.error('Selected resource index is not a number, clearing input', {
        intValue: selectedResourceIndex,
      });

      await this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Invalid resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));

      return await this.onStateEnter();
    }

    const resource = this.socket.reader.resources[selectedResourceIndex - 1];

    if (!resource) {
      this.logger.error(
        'Resource with id not found',
        selectedResourceIndex,
        this.socket.reader.resources.map((r) => r.id),
        typeof selectedResourceIndex
      );

      await this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
          message: 'Unknown resource',
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));

      return await this.onStateEnter();
    }

    this.logger.debug(`Reader has selected resource with index ${selectedResourceIndex}, moving to WaitForNFCTapState`);
    const nextState = new WaitForNFCTapState(this.socket, this.services, {
      resourceId: resource.id,
      timeout_ms: 30000,
      timout_transition_state: new InitialReaderState(this.socket, this.services),
      needsConfirmation: false,
    });
    return await this.socket.transitionToState(nextState);
  }
}
