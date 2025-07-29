import { Logger } from '@nestjs/common';
import { ReaderState } from './reader-state.interface';
import { InitialReaderState } from './initial.state';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType, AttractapResponse } from '../websocket.types';
import { GatewayServices } from '../websocket.gateway';
import { NFCCard } from '@attraccess/database-entities';

export class ResetNTAG424State implements ReaderState {
  private readonly logger = new Logger(ResetNTAG424State.name);
  private card: NFCCard | null = null;

  // key numbers
  public readonly KEY_ZERO_MASTER = 0;

  // 16 bytes of 0 as Uint8Array
  public readonly DEFAULT_NTAG424_KEYS = {
    [this.KEY_ZERO_MASTER]: new Uint8Array(16).fill(0),
  };

  constructor(
    private readonly socket: AuthenticatedWebSocket,
    private readonly services: GatewayServices,
    private readonly cardId: NFCCard['id']
  ) {}

  public async onStateEnter(): Promise<void> {
    this.card = await this.services.attractapService.getNFCCardByID(this.cardId);

    if (!this.card) {
      throw new Error(`Card not found: ${this.cardId}`);
    }

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, {
        type: 'reset-nfc-card',
        card: {
          id: this.card.id,
        },
        user: {
          id: this.card.user?.id,
          username: this.card.user?.username,
        },
      })
    );
  }

  public async onStateExit(): Promise<void> {
    return;
  }

  public async onEvent(eventData: AttractapEvent['data']): Promise<void> {
    if (eventData.type === AttractapEventType.NFC_TAP) {
      return this.onGetNfcUID(eventData);
    }

    if (eventData.type === AttractapEventType.CANCEL) {
      this.logger.log('Reset cancelled by user. Transitioning to initial state.');
      return this.socket.transitionToState(new InitialReaderState(this.socket, this.services));
    }

    this.logger.warn(`Unexpected event type ${eventData.type}`);
  }

  public async onResponse(responseData: AttractapResponse['data']): Promise<void> {
    if (responseData.type === AttractapEventType.NFC_CHANGE_KEYS) {
      return await this.onKeysChanged(responseData);
    }

    this.logger.warn(`Unexpected response type ${responseData.type} `);
  }

  private async onGetNfcUID(responseData: AttractapResponse['data']): Promise<void> {
    const cardUID = responseData.payload.cardUID;
    if (cardUID !== this.card?.uid) {
      this.logger.warn(`Unexpected card UID ${cardUID}, ignoring`);
      return;
    }

    // Only if the card UID matches, disable card checking
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_DISABLE_CARD_CHECKING));

    const nfcCard = await this.services.attractapService.getNFCCardByUID(cardUID);

    const masterKey: string =
      nfcCard?.keys[this.KEY_ZERO_MASTER] ??
      this.services.attractapService.uint8ArrayToHexString(this.DEFAULT_NTAG424_KEYS[this.KEY_ZERO_MASTER]);

    const newKeys = {
      [this.KEY_ZERO_MASTER]: this.services.attractapService.uint8ArrayToHexString(
        this.DEFAULT_NTAG424_KEYS[this.KEY_ZERO_MASTER]
      ),
    };

    this.logger.debug('Sending ChangeKeys event', {
      authenticationKey: masterKey,
      keys: newKeys,
    });

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_CHANGE_KEYS, {
        authenticationKey: masterKey,
        keys: newKeys,
      })
    );
  }

  private async onKeysChanged(responseData: AttractapResponse['data']): Promise<void> {
    const failedKeys = responseData.payload.failedKeys as number[];
    const successfulKeys = responseData.payload.successfulKeys as number[];

    if (successfulKeys?.length !== 1 || failedKeys?.length > 0) {
      this.logger.error(
        `Keys ${failedKeys?.join(', ')} failed to change, Keys ${successfulKeys?.join(', ')} changed successfully`
      );

      const nextState = new InitialReaderState(this.socket, this.services);
      return this.socket.transitionToState(nextState);
    }

    await this.services.attractapService.deleteNFCCard(this.cardId);

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
        message: 'Card erased',
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_SUCCESS));

    const initialState = new InitialReaderState(this.socket, this.services);
    this.socket.transitionToState(initialState);
  }
}
