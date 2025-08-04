import { Logger } from '@nestjs/common';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEventType, AttractapResponse } from '../websocket.types';
import { AttractapEvent } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { NFCCard, Resource, User } from '@attraccess/database-entities';

export enum WaitForNFCTapStateStep {
  IDLE = 'idle',
  WAIT_FOR_TAP = 'wait-for-tap',
  PROCESSING_TAP = 'processing-tap',
  WAIT_FOR_AUTHENTICATION = 'wait-for-authentication',
  PROCESSING_AUTHENTICATION = 'processing-authentication',
}

export class WaitForNFCTapState implements ReaderState {
  public state: WaitForNFCTapStateStep = WaitForNFCTapStateStep.IDLE;
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
  ) {}

  public async onStateEnter(): Promise<void> {
    this.state = WaitForNFCTapStateStep.WAIT_FOR_TAP;

    this.startTimeout();

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

    await this.enableCardChecking(payload);
  }

  public async onStateExit(): Promise<void> {
    this.stopTimeout();
    await this.disableCardChecking();
  }

  public async restart(): Promise<void> {
    await this.onStateExit();
    return await this.onStateEnter();
  }

  public async onEvent(data: AttractapEvent['data']): Promise<void> {
    if (data.type === AttractapEventType.NFC_TAP && this.state === WaitForNFCTapStateStep.WAIT_FOR_TAP) {
      this.stopTimeout();

      return this.onNFCTap(data);
    }

    return undefined;
  }

  public async onResponse(data: AttractapResponse['data']): Promise<void> {
    if (
      data.type === AttractapEventType.NFC_AUTHENTICATE &&
      this.state === WaitForNFCTapStateStep.WAIT_FOR_AUTHENTICATION
    ) {
      return await this.onAuthenticate(data);
    }

    return undefined;
  }

  private startTimeout(): void {
    this.stopTimeout();

    this.timeout = setTimeout(async () => {
      this.logger.debug(
        `Reader has not tapped a card within ${this.timeout_ms}ms, moving to ${this.timout_transition_state?.constructor.name}`
      );

      await this.socket.transitionToState(this.timout_transition_state);
    }, this.timeout_ms);
  }

  private stopTimeout(): void {
    if (!this.timeout_ms) {
      return;
    }

    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }

  private async enableCardChecking(payload: AttractapEvent['data']['payload']): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, payload));
  }

  private async disableCardChecking(): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_DISABLE_CARD_CHECKING));
  }

  private async onInvalidCard(): Promise<void> {
    await this.disableCardChecking();

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
        message: `Invalid card`,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_ERROR));

    await this.restart();
  }

  private async onNFCTap(data: AttractapEvent<{ cardUID: string }>['data']): Promise<void> {
    this.state = WaitForNFCTapStateStep.PROCESSING_TAP;

    await this.socket.sendMessage(
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

    this.state = WaitForNFCTapStateStep.WAIT_FOR_AUTHENTICATION;

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_AUTHENTICATE, {
        authenticationKey: nfcCard.keys[0],
        keyNumber: 0,
      })
    );
  }

  private async onAuthenticate(data: AttractapEvent<{ authenticationSuccessful: boolean }>['data']): Promise<void> {
    this.state = WaitForNFCTapStateStep.PROCESSING_AUTHENTICATION;

    if (!this.card) {
      this.logger.error('No card attached to socket..');
      return;
    }

    if (!data.payload.authenticationSuccessful) {
      return this.onInvalidCard();
    }

    const userOfNFCCard = await this.services.usersService.findOne({ id: this.card.user.id });

    if (!userOfNFCCard) {
      this.logger.debug(`User with ID ${this.card.user.id} not found`);
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

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
        message: responseMessage,
      })
    );

    this.logger.debug(`Waiting for 10 seconds before clearing success message`);
    const before = new Date();
    await new Promise((resolve) => setTimeout(resolve, 10000));
    const after = new Date();
    this.logger.debug(`Cleared success message after ${after.getTime() - before.getTime()}ms`);
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CLEAR_SUCCESS));

    if (this.success_transition_state) {
      this.logger.debug(`Transitioning to success state: ${this.success_transition_state.constructor.name}`);
      return await this.socket.transitionToState(this.success_transition_state);
    }

    this.logger.debug(`Transitioning to restart state: ${this.timout_transition_state.constructor.name}`);

    return await this.restart();
  }
}
