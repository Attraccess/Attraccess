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
  READER_REGISTER = 'READER_REGISTER',
  READER_AUTHENTICATE = 'READER_AUTHENTICATE',
  NFC_AUTHENTICATE = 'NFC_AUTHENTICATE',
  READER_UNAUTHORIZED = 'READER_UNAUTHORIZED',
  READER_REQUEST_AUTHENTICATION = 'READER_REQUEST_AUTHENTICATION',
  READER_AUTHENTICATED = 'READER_AUTHENTICATED',
  NFC_TAP = 'NFC_TAP',
  NFC_CHANGE_KEY = 'NFC_CHANGE_KEY',
  NFC_ENABLE_CARD_CHECKING = 'NFC_ENABLE_CARD_CHECKING',
  WAIT_FOR_PROCESSING = 'WAIT_FOR_PROCESSING',
  DISPLAY_TEXT = 'DISPLAY_TEXT',
  DISPLAY_SUCCESS = 'DISPLAY_SUCCESS',
  DISPLAY_ERROR = 'DISPLAY_ERROR',
  CANCEL = 'CANCEL',
  READER_FIRMWARE_UPDATE_REQUIRED = 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_FIRMWARE_STREAM_CHUNK = 'READER_FIRMWARE_STREAM_CHUNK',
  READER_FIRMWARE_INFO = 'READER_FIRMWARE_INFO',
  SELECT_ITEM = 'SELECT_ITEM',
  CONFIRM_ACTION = 'CONFIRM_ACTION',
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
  reader?: Attractap;
  state?: ReaderState;
  transitionToState: (state: ReaderState) => Promise<void>;
  sendMessage: (message: AttractapMessage) => Promise<void>;
  sendBinaryData: (data: Buffer) => void;
}

// Firmware update related types
export interface FirmwareUpdateStartPayload {
  size: number;
  checksum?: string;
  version?: string;
  is_retry?: boolean;
}

export interface FirmwareUpdateResponse {
  ready?: boolean;
  success?: boolean;
  error?: string;
  bytes_received?: number;
  duration_ms?: number;
  retry_attempt?: number;
  max_attempts?: number;
  bytes_received_before_timeout?: number;
}
