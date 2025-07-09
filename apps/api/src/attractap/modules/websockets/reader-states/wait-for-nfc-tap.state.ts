import { Logger } from '@nestjs/common';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEventType, AttractapResponse } from '../websocket.types';
import { AttractapEvent } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { NFCCard } from '@attraccess/database-entities';

export class WaitForNFCTapState implements ReaderState {
  private readonly logger = new Logger(WaitForNFCTapState.name);

  private timeout?: NodeJS.Timeout;

  private card?: NFCCard;

  public constructor(
    private readonly socket: AuthenticatedWebSocket,
    private readonly services: GatewayServices,
    private readonly selectedResourceId: number,
    private readonly timeout_ms = 0,
    private readonly timout_transition_state?: ReaderState,
    private readonly success_transition_state?: ReaderState
  ) {
    this.restartTimeout();
  }

  public async onStateEnter(): Promise<void> {
    const activeUsageSession = await this.services.resourceUsageService.getActiveSession(this.selectedResourceId);
    const resourceIsInUse = !!activeUsageSession;

    if (resourceIsInUse) {
      return this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.ENABLE_CARD_CHECKING, {
          message: `Tap to stop`,
        })
      );
    }

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.ENABLE_CARD_CHECKING, {
        message: `Tap to start`,
      })
    );
  }

  public async onStateExit(): Promise<void> {
    clearTimeout(this.timeout);
    this.sendDisableCardChecking();
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.HIDE_TEXT));
  }

  public async restart(): Promise<void> {
    await this.onStateExit();
    return await this.onStateEnter();
  }

  public async onEvent(data: AttractapEvent['data']): Promise<void> {
    if (data.type === AttractapEventType.NFC_TAP) {
      this.restartTimeout();

      return this.onNFCTap(data);
    }

    return undefined;
  }

  public async onResponse(data: AttractapResponse['data']): Promise<void> {
    if (data.type === AttractapEventType.AUTHENTICATE) {
      this.restartTimeout();

      return await this.onAuthenticate(data);
    }

    return undefined;
  }

  private restartTimeout(): Promise<void> {
    if (!this.timeout_ms) {
      return;
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
    }

    this.timeout = setTimeout(async () => {
      this.logger.debug(
        `Reader has not tapped a card within ${this.timeout_ms}ms, moving to ${this.timout_transition_state?.constructor.name}`
      );

      this.sendDisableCardChecking();

      this.socket.transitionToState(this.timout_transition_state);
    }, this.timeout_ms);
  }

  private sendDisableCardChecking(textToDisplay?: string): void {
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.DISABLE_CARD_CHECKING));

    if (textToDisplay) {
      this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.SHOW_TEXT, {
          lineOne: textToDisplay,
          lineTwo: '',
        })
      );
    }
  }

  private async onInvalidCard(): Promise<void> {
    this.sendDisableCardChecking();

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
        message: `Invalid card`,
        duration: 3000,
      })
    );

    await this.restart();
  }

  private async onNFCTap(data: AttractapEvent<{ cardUID: string }>['data']): Promise<void> {
    this.sendDisableCardChecking('Do not remove card!');

    const nfcCard = await this.services.attractapService.getNFCCardByUID(data.payload.cardUID);

    if (!nfcCard) {
      this.logger.debug(`NFC Card with UID ${data.payload.cardUID} not found`);
      return this.onInvalidCard();
    }

    this.card = nfcCard;

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.AUTHENTICATE, {
        authenticationKey: nfcCard.keys[0],
        keyNumber: 0,
      })
    );
  }

  private async onAuthenticate(data: AttractapEvent<{ cardUID: string }>['data']): Promise<void> {
    if (!this.card) {
      this.logger.error('No card attached to socket..');
      return;
    }

    const userOfNFCCard = await this.services.usersService.findOne({ id: this.card.userId });

    if (!userOfNFCCard) {
      this.logger.debug(`User (of NFC Card with UID ${data.payload.cardUID}) with ID ${this.card.userId} not found`);
      return this.onInvalidCard();
    }

    const activeUsageSession = await this.services.resourceUsageService.getActiveSession(this.selectedResourceId);

    const resourceIsInUse = !!activeUsageSession;

    let responseMessage = '-';
    if (resourceIsInUse) {
      responseMessage = 'Resource stopped';
      this.logger.debug(`Stopping resource usage for user ${userOfNFCCard.id} on resource ${this.selectedResourceId}`);
      await this.services.resourceUsageService.endSession(this.selectedResourceId, userOfNFCCard, {
        notes: `-- by Attractap (ID: ${this.socket.reader.id}) with NFC Card (ID: ${this.card.id}) --`,
      });
    } else {
      responseMessage = 'Resource started';
      this.logger.debug(`Starting resource usage for user ${userOfNFCCard.id} on resource ${this.selectedResourceId}`);
      await this.services.resourceUsageService.startSession(this.selectedResourceId, userOfNFCCard, {
        notes: `-- by Attractap (ID: ${this.socket.reader.id}) with NFC Card (ID: ${this.card.id}) --`,
      });
    }

    this.restartTimeout();

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
        message: responseMessage,
        duration: 3000,
      })
    );

    if (this.success_transition_state) {
      this.socket.state = this.success_transition_state;
      return await this.socket.transitionToState(this.success_transition_state);
    }

    return await this.restart();
  }
}
