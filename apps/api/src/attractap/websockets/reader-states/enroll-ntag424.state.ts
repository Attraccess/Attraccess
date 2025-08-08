import { Logger } from '@nestjs/common';
import { ReaderState } from './reader-state.interface';
import { InitialReaderState } from './initial.state';
import { User } from '@attraccess/plugins-backend-sdk';
import { AuthenticatedWebSocket, AttractapEvent, AttractapEventType, AttractapResponse } from '../websocket.types';
import { GatewayServices } from '../websocket.gateway';

export interface EnrollmentState {
  nextExpectedEvent: AttractapEventType;
  cardUID?: string;
  data: {
    newKeyZeroMaster?: string;
    verificationToken?: Uint8Array;
  };
}

export class EnrollNTAG424State implements ReaderState {
  private readonly logger = new Logger(EnrollNTAG424State.name);

  private enrollment?: EnrollmentState;

  // key numbers
  public readonly KEY_ZERO_MASTER = 0;

  // 16 bytes of 0 as Uint8Array
  public readonly DEFAULT_NTAG424_KEYS = {
    [this.KEY_ZERO_MASTER]: new Uint8Array(16).fill(0),
  };

  public readonly VERIFICATION_TOKEN_FILE_ID = 0x00;
  public readonly ANTI_DUPLICATION_TOKEN_FILE_ID = 0x01;

  private retriedWithNewKey = false;

  constructor(
    private readonly socket: AuthenticatedWebSocket,
    private readonly services: GatewayServices,
    private readonly user: User
  ) {}

  public async onStateEnter(): Promise<void> {
    this.enrollment = {
      nextExpectedEvent: AttractapEventType.NFC_TAP,
      data: {},
    };
    await this.enableCardChecking({
      type: 'enroll-nfc-card',
      user: {
        id: this.user.id,
        username: this.user.username,
      },
    });
  }

  public async onStateExit(): Promise<void> {
    this.enrollment = undefined;
    await this.disableCardChecking();
  }

  public async onEvent(eventData: AttractapEvent['data']): Promise<void> {
    if (
      eventData.type === AttractapEventType.NFC_TAP &&
      this.enrollment?.nextExpectedEvent === AttractapEventType.NFC_TAP
    ) {
      return this.onGetNfcUID(eventData);
    }

    if (eventData.type === AttractapEventType.CANCEL) {
      this.logger.log('Enrollment cancelled by user. Transitioning to initial state.');
      this.enrollment = undefined;
      return await this.socket.transitionToState(new InitialReaderState(this.socket, this.services));
    }

    this.logger.debug(`Unexpected event type ${eventData.type} in state ${this.enrollment?.nextExpectedEvent}`);
  }

  public async onResponse(responseData: AttractapResponse['data']): Promise<void> {
    if (this.enrollment?.nextExpectedEvent !== responseData.type) {
      this.logger.warn(`Unexpected response type ${responseData.type} in state ${this.enrollment?.nextExpectedEvent}`);
      return;
    }

    if (responseData.type === AttractapEventType.NFC_CHANGE_KEY) {
      return this.onKeyChanged(responseData);
    }

    this.logger.warn(`Unknown response type ${responseData.type} in state ${this.enrollment?.nextExpectedEvent}`);
  }

  private async enableCardChecking(payload: AttractapEvent['data']['payload']): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.NFC_ENABLE_CARD_CHECKING, payload));
  }

  private async disableCardChecking(): Promise<void> {
    await this.socket.sendMessage(new AttractapEvent(AttractapEventType.WAIT_FOR_PROCESSING));
  }

  private async onGetNfcUID(responseData: AttractapResponse<{ cardUID: string }>['data']): Promise<void> {
    await this.disableCardChecking();

    const cardUID = responseData.payload.cardUID;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.enrollment!.cardUID = cardUID;

    const nfcCard = await this.services.attractapService.getNFCCardByUID(cardUID);

    const masterKey: string =
      nfcCard?.keys[this.KEY_ZERO_MASTER] ??
      this.services.attractapService.uint8ArrayToHexString(this.DEFAULT_NTAG424_KEYS[this.KEY_ZERO_MASTER]);

    const newKey = await this.services.attractapService.generateNTAG424Key({
      keyNo: this.KEY_ZERO_MASTER,
      cardUID,
      userId: this.user.id,
    });
    this.enrollment.data.newKeyZeroMaster = this.services.attractapService.uint8ArrayToHexString(newKey);

    this.enrollment.nextExpectedEvent = AttractapEventType.NFC_CHANGE_KEY;
    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.NFC_CHANGE_KEY, {
        keyNumber: this.KEY_ZERO_MASTER,
        authKey: masterKey,
        oldKey: masterKey,
        newKey: this.enrollment.data.newKeyZeroMaster,
      })
    );
  }

  private async onKeyChanged(responseData: AttractapResponse<{ successful: boolean }>['data']): Promise<void> {
    const successful = responseData.payload.successful;

    if (!successful && this.retriedWithNewKey !== true && this.enrollment.data.newKeyZeroMaster) {
      this.retriedWithNewKey = true;

      this.logger.debug('Change key failed, retrying with new key in case it was a fluke', {
        enrollmentState: this.enrollment,
      });

      return await this.socket.sendMessage(
        new AttractapEvent(AttractapEventType.NFC_CHANGE_KEY, {
          keyNumber: this.KEY_ZERO_MASTER,
          authKey: this.enrollment.data.newKeyZeroMaster,
          oldKey: this.enrollment.data.newKeyZeroMaster,
          newKey: this.enrollment.data.newKeyZeroMaster,
        })
      );
    }

    if (!successful) {
      this.logger.error(`Key ${this.KEY_ZERO_MASTER} failed to change`, {
        enrollmentState: this.enrollment,
      });

      this.enrollment = undefined;
      return await this.socket.transitionToState(new InitialReaderState(this.socket, this.services));
    }

    const user = await this.services.usersService.findOne({ id: this.user.id });

    if (!user) {
      this.logger.error('Enrollment failed: User not found', {
        enrollmentState: this.enrollment,
      });

      return await this.socket.transitionToState(new InitialReaderState(this.socket, this.services));
    }

    const nfcCard = await this.services.attractapService.createNFCCard(user, {
      uid: this.enrollment.cardUID,
      keys: {
        [this.KEY_ZERO_MASTER]: this.enrollment.data.newKeyZeroMaster,
      },
    });

    this.logger.log(`Created NFC card ${nfcCard.id} for user ${this.user.id}`);

    await this.socket.sendMessage(
      new AttractapEvent(AttractapEventType.DISPLAY_SUCCESS, {
        message: 'Enrollment successful',
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 10000));

    const nextState = new InitialReaderState(this.socket, this.services);
    await this.socket.transitionToState(nextState);
  }
}
