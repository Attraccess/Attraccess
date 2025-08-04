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

    await this.enableCardChecking({
      type: 'reset-nfc-card',
      card: {
        id: this.card.id,
      },
      user: {
        id: this.card.user.id,
        username: this.card.user.username,
      },
    });
  }

  public async onStateExit(): Promise<void> {
    await this.disableCardChecking();
  }

  public async onEvent(eventData: AttractapEvent['data']): Promise<void> {
    if (eventData.type === AttractapEventType.NFC_TAP) {
      return this.onGetNfcUID(eventData);
    }

    if (eventData.type === AttractapEventType.CANCEL) {
      this.logger.log('Reset cancelled by user. Transitioning to initial state.');
      return await this.socket.transitionToState(new InitialReaderState(this.socket, this.services));
    }

    this.logger.warn(`Unexpected event type ${eventData.type}`);
  }

  public async onResponse(responseData: AttractapResponse['data']): Promise<void> {
    if (responseData.type === AttractapEventType.NFC_CHANGE_KEY) {
      return await this.onKeyChanged(responseData);
    }

    this.logger.warn(`Unexpected response type ${responseData.type} `);
  }

  private async enableCardChecking(payload: AttractapEvent['data']['payload']): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, payload));
  }

  private async disableCardChecking(): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_DISABLE_CARD_CHECKING));
  }

  private async onGetNfcUID(responseData: AttractapResponse['data']): Promise<void> {
    const cardUID = responseData.payload.cardUID;
    if (cardUID !== this.card?.uid) {
      this.logger.warn(`Unexpected card UID ${cardUID}, ignoring`);
      return;
    }

    // Only if the card UID matches, disable card checking
    await this.disableCardChecking();

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
      newKeyZeroMaster: newKeys[this.KEY_ZERO_MASTER],
    });

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_CHANGE_KEY, {
        keyNumber: this.KEY_ZERO_MASTER,
        authKey: masterKey,
        oldKey: masterKey,
        newKey: newKeys[this.KEY_ZERO_MASTER],
      })
    );
  }

  private async onKeyChanged(responseData: AttractapResponse<{ successful: boolean }>['data']): Promise<void> {
    const successful = responseData.payload.successful;

    if (!successful) {
      this.logger.error(`Key ${this.KEY_ZERO_MASTER} failed to change`);

      const nextState = new InitialReaderState(this.socket, this.services);
      return await this.socket.transitionToState(nextState);
    }

    await this.services.attractapService.deleteNFCCard(this.cardId);

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
        message: 'Card erased',
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_SUCCESS));

    const initialState = new InitialReaderState(this.socket, this.services);
    await this.socket.transitionToState(initialState);
  }
}
