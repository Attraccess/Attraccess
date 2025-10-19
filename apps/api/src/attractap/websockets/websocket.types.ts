import { Attractap } from '@attraccess/database-entities';

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
  READER_UNAUTHORIZED = 'READER_UNAUTHORIZED',
  READER_REQUEST_AUTHENTICATION = 'READER_REQUEST_AUTHENTICATION',
  READER_AUTHENTICATED = 'READER_AUTHENTICATED',
  READER_FIRMWARE_UPDATE_REQUIRED = 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_FIRMWARE_STREAM_CHUNK = 'READER_FIRMWARE_STREAM_CHUNK',
  READER_FIRMWARE_INFO = 'READER_FIRMWARE_INFO',
  RESOURCE_LIST = 'RESOURCE_LIST',
  REQUEST_CARD_AUTHENTICATION_DATA = 'REQUEST_CARD_AUTHENTICATION_DATA',
  CARD_AUTHENTICATION_DATA = 'CARD_AUTHENTICATION_DATA',
  REQUEST_RESOURCE_THUMBNAIL = 'REQUEST_RESOURCE_THUMBNAIL',
  RESOURCE_THUMBNAIL_DATA = 'RESOURCE_THUMBNAIL_DATA',
  START_RESOURCE_USAGE_SESSION = 'START_RESOURCE_USAGE_SESSION',
  STOP_RESOURCE_USAGE_SESSION = 'STOP_RESOURCE_USAGE_SESSION',
  LOCK_DOOR = 'LOCK_DOOR',
  UNLOCK_DOOR = 'UNLOCK_DOOR',
  UNLATCH_DOOR = 'UNLATCH_DOOR',
  ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO = 'ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO',
  ENROLL_NEW_CARD_REQUEST_NFC_KEY = 'ENROLL_NEW_CARD_REQUEST_NFC_KEY',
  ENROLL_NEW_CARD = 'ENROLL_NEW_CARD',
  TRIGGER_FLOW_BUTTON = 'TRIGGER_FLOW_BUTTON',
}

export interface ResourceThumbnailDescriptorPayload {
  transferId: string;
  resourceId: number;
  width: number;
  height: number;
  format: 'PNG';
  contentLength: number;
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
export type AttractapMessage<TPayload = any | undefined> = AttractapEvent<TPayload>;

export interface AuthenticatedWebSocket extends Omit<WebSocket, 'send'> {
  id: string;
  readerId: Attractap['id'] | null;
  sendMessage: (message: AttractapMessage) => Promise<void>;
  sendBinaryData: (data: Buffer) => void;
  state: {
    lastAuthenticatedUserId: number | null;
    enrollNewCardData: {
      key: string;
      keyNo: number;
      cardUID: string;
    } | null;
  };
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
