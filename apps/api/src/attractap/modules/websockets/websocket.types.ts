import { Attractap } from '@attraccess/database-entities';
import { ReaderState } from './reader-states/reader-state.interface';

interface AttractapMessageBaseData<TPayload = unknown> {
  auth?: {
    id: number;
    token: string;
  };
  payload: TPayload;
}

export enum AttractapEventType {
  REGISTER = 'REGISTER',
  AUTHENTICATE = 'AUTHENTICATE',
  UNAUTHORIZED = 'UNAUTHORIZED',
  READER_AUTHENTICATED = 'READER_AUTHENTICATED',
  SHOW_TEXT = 'SHOW_TEXT',
  HIDE_TEXT = 'HIDE_TEXT',
  KEY_PRESSED = 'KEY_PRESSED',
  NFC_TAP = 'NFC_TAP',
  CHANGE_KEYS = 'CHANGE_KEYS',
  ENABLE_CARD_CHECKING = 'ENABLE_CARD_CHECKING',
  DISABLE_CARD_CHECKING = 'DISABLE_CARD_CHECKING',
  DISPLAY_SUCCESS = 'DISPLAY_SUCCESS',
  DISPLAY_ERROR = 'DISPLAY_ERROR',
  REAUTHENTICATE = 'REAUTHENTICATE',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AttractapEvent<TPayload = any | undefined> {
  public readonly event = 'EVENT';
  public readonly data: AttractapMessageBaseData<TPayload> & {
    type: AttractapEventType;
  };

  public constructor(type: AttractapEventType, payload: TPayload = undefined) {
    this.data = {
      type,
      payload,
    };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class AttractapResponse<TPayload = any | undefined> {
  public readonly event = 'RESPONSE';
  public readonly data: AttractapMessageBaseData<TPayload> & {
    type: AttractapEventType;
  };

  public constructor(type: AttractapEventType, payload: TPayload) {
    this.data = {
      type,
      payload,
    };
  }

  public static fromEventData<TPayload>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventData: AttractapEvent<any>['data'],
    payload: TPayload
  ): AttractapResponse<TPayload> {
    return new AttractapResponse(eventData.type, payload);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AttractapMessage<TPayload = any | undefined> = AttractapEvent<TPayload> | AttractapResponse<TPayload>;

export interface AuthenticatedWebSocket extends Omit<WebSocket, 'send'> {
  id: string;
  disconnectTimeout?: NodeJS.Timeout;
  reader?: Attractap;
  state?: ReaderState;
  transitionToState: (state: ReaderState) => Promise<void>;
  sendMessage: (message: AttractapMessage) => void;
}
