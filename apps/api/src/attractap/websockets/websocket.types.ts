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
  readerId: Attractap['id'];
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
