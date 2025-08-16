import { Logger } from '@nestjs/common';
import { GatewayServices } from '../websocket.gateway';
import { AuthenticatedWebSocket, AttractapEventType, AttractapResponse } from '../websocket.types';
import { AttractapEvent } from '../websocket.types';
import { ReaderState } from './reader-state.interface';
import { NFCCard, Resource, User } from '@attraccess/database-entities';

export enum WaitForNFCTapStateStep {
  IDLE = 'idle',
  WAIT_FOR_CONFIRMATION = 'wait-for-confirmation',
  WAIT_FOR_TAP = 'wait-for-tap',
  PROCESSING_TAP = 'processing-tap',
  WAIT_FOR_AUTHENTICATION = 'wait-for-authentication',
  PROCESSING_AUTHENTICATION = 'processing-authentication',
}

interface Options {
  resourceId: number;
  timeout_ms: number;
  timout_transition_state?: ReaderState;
  success_transition_state?: ReaderState;
  needsConfirmation: boolean;
}

export class WaitForNFCTapState implements ReaderState {
  public state: WaitForNFCTapStateStep = WaitForNFCTapStateStep.IDLE;
  private readonly logger = new Logger(WaitForNFCTapState.name);
  private readonly selectedResourceId: number;
  private readonly timeout_ms: number;
  private readonly timout_transition_state?: ReaderState;
  private readonly success_transition_state?: ReaderState;
  private readonly needsConfirmation: boolean;

  private timeout?: NodeJS.Timeout;

  private card?: NFCCard;

  public constructor(
    private readonly socket: AuthenticatedWebSocket,
    private readonly services: GatewayServices,
    options: Options
  ) {
    if (options.timeout_ms && !options.timout_transition_state) {
      throw new Error('Timeout is set but no timeout transition state is provided');
    }

    this.selectedResourceId = options.resourceId;
    this.timeout_ms = options.timeout_ms;
    this.timout_transition_state = options.timout_transition_state;
    this.success_transition_state = options.success_transition_state;
    this.needsConfirmation = options.needsConfirmation;
  }

  public async onStateEnter(): Promise<void> {
    this.state = WaitForNFCTapStateStep.WAIT_FOR_TAP;

    this.startTimeout();

    if (this.needsConfirmation) {
      await this.requestConfirmation();
      return;
    }

    await this.enableCardChecking();
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
      data.type === AttractapEventType.CONFIRM_ACTION &&
      this.state === WaitForNFCTapStateStep.WAIT_FOR_CONFIRMATION
    ) {
      return this.onConfirmAction();
    }

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

    if (this.timeout_ms === 0) {
      return;
    }

    this.timeout = setTimeout(async () => {
      this.logger.debug(
        `Reader has not tapped a card within ${this.timeout_ms}ms, moving to ${this.timout_transition_state?.constructor.name}`
      );

      console.log({
        timout_transition_state: this.timout_transition_state,
        timeout_ms: this.timeout_ms,
      });

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

  private async getTappingPayload() {
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

    return payload;
  }

  private async requestConfirmation(): Promise<void> {
    this.state = WaitForNFCTapStateStep.WAIT_FOR_CONFIRMATION;
    const payload = await this.getTappingPayload();
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.CONFIRM_ACTION, payload));
  }

  private async enableCardChecking(): Promise<void> {
    this.state = WaitForNFCTapStateStep.WAIT_FOR_TAP;
    const payload = await this.getTappingPayload();

    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, payload));
  }

  private async disableCardChecking(): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.WAIT_FOR_PROCESSING));
  }

  private async onInvalidCard(reason?: string): Promise<void> {
    await this.disableCardChecking();

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_ERROR, {
        message: `Invalid card${reason ? `: ${reason}` : ''}`,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));

    await this.restart();
  }

  private async onNFCTap(data: AttractapEvent<{ cardUID: string }>['data']): Promise<void> {
    this.state = WaitForNFCTapStateStep.PROCESSING_TAP;

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_TEXT, {
        message: 'Do not remove card!',
      })
    );

    const nfcCard = await this.services.attractapService.getNFCCardByUID(data.payload.cardUID);

    if (!nfcCard) {
      this.logger.debug(`NFC Card with UID ${data.payload.cardUID} not found`);
      return this.onInvalidCard();
    }

    if (!nfcCard.isActive) {
      this.logger.debug(`NFC Card with UID ${data.payload.cardUID} is not active`);
      return this.onInvalidCard('deactivated');
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

  private async onAuthenticate(data: AttractapEvent<{ successful: boolean }>['data']): Promise<void> {
    this.state = WaitForNFCTapStateStep.PROCESSING_AUTHENTICATION;

    if (!this.card) {
      this.logger.error('No card attached to socket..');
      return;
    }

    if (!data.payload.successful) {
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

    if (this.success_transition_state) {
      this.logger.debug(`Transitioning to success state: ${this.success_transition_state.constructor.name}`);
      return await this.socket.transitionToState(this.success_transition_state);
    }

    return await this.restart();
  }

  private async onConfirmAction(): Promise<void> {
    this.enableCardChecking();
  }
}
