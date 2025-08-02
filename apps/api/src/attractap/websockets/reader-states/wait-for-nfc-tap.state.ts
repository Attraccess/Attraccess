import { Logger } from '@nestjs/common';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEventType, AttractapResponse } from '../websocket.types';
import { AttractapEvent } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { NFCCard, Resource, User } from '@attraccess/database-entities';

export class WaitForNFCTapState implements ReaderState {
  public isInProgress = false;
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

    const resource = await this.services.resourcesService.getResourceById(this.selectedResourceId);

    const simplifiedResource = {
      id: resource.id,
      name: resource.name,
      description: resource.description,
      imageFilename: resource.imageFilename,
    } as Pick<Resource, 'id' | 'name' | 'description' | 'imageFilename'>;

    const maintenances = await this.services.resourceMaintenanceService.findMaintenances(this.selectedResourceId, {
      includeActive: true,
      includePast: false,
      includeUpcoming: false,
    });

    const hasActiveMaintenance = maintenances.data.length > 0;

    const payload = {
      type: 'toggle-resource-usage',
      resource: simplifiedResource,
      isActive: false,
      activeUsageSession: null,
      hasActiveMaintenance,
      maintenances: maintenances.data,
    };

    if (resourceIsInUse) {
      payload.isActive = true;
      payload.activeUsageSession = {
        user: {
          id: activeUsageSession.userId,
          username: activeUsageSession.user.username,
        } as Pick<User, 'id' | 'username'>,
      };
    }

    this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, payload));
  }

  public async onStateExit(): Promise<void> {
    clearTimeout(this.timeout);
    this.sendDisableCardChecking();
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
    if (data.type === AttractapEventType.NFC_AUTHENTICATE) {
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

  private sendDisableCardChecking(): void {
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_DISABLE_CARD_CHECKING));
  }

  private async onInvalidCard(): Promise<void> {
    this.sendDisableCardChecking();

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
        message: `Invalid card`,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

    await this.restart();
  }

  private async onNFCTap(data: AttractapEvent<{ cardUID: string }>['data']): Promise<void> {
    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.SHOW_TEXT, {
        message: 'Do not remove card!',
      })
    );

    const nfcCard = await this.services.attractapService.getNFCCardByUID(data.payload.cardUID);

    if (!nfcCard) {
      this.logger.debug(`NFC Card with UID ${data.payload.cardUID} not found`);
      return this.onInvalidCard();
    }

    this.card = nfcCard;

    this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_AUTHENTICATE, {
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

    this.isInProgress = true;

    try {
      const userOfNFCCard = await this.services.usersService.findOne({ id: this.card.user.id });

      if (!userOfNFCCard) {
        this.logger.debug(`User (of NFC Card with UID ${data.payload.cardUID}) with ID ${this.card.user.id} not found`);
        return this.onInvalidCard();
      }

      const activeUsageSession = await this.services.resourceUsageService.getActiveSession(this.selectedResourceId);

      const resourceIsInUse = !!activeUsageSession;

      let responseMessage = '-';
      if (resourceIsInUse) {
        responseMessage = 'Resource stopped';
        this.logger.debug(
          `Stopping resource usage for user ${userOfNFCCard.id} on resource ${this.selectedResourceId}`
        );
        await this.services.resourceUsageService.endSession(this.selectedResourceId, userOfNFCCard, {
          notes: `-- by Attractap (ID: ${this.socket.reader.id}) with NFC Card (ID: ${this.card.id}) --`,
        });
      } else {
        responseMessage = 'Resource started';
        this.logger.debug(
          `Starting resource usage for user ${userOfNFCCard.id} on resource ${this.selectedResourceId}`
        );
        await this.services.resourceUsageService.startSession(this.selectedResourceId, userOfNFCCard, {
          notes: `-- by Attractap (ID: ${this.socket.reader.id}) with NFC Card (ID: ${this.card.id}) --`,
        });
      }

      this.restartTimeout();

      this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
          message: responseMessage,
        })
      );

      this.logger.debug(`Waiting for 10 seconds before clearing success message`);
      const before = new Date();
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const after = new Date();
      this.logger.debug(`Cleared success message after ${after.getTime() - before.getTime()}ms`);
      this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_SUCCESS));

      if (this.success_transition_state) {
        this.socket.state = this.success_transition_state;
        return await this.socket.transitionToState(this.success_transition_state);
      }
    } finally {
      this.isInProgress = false;
    }

    return await this.restart();
  }
}
