import { Attractap, ResourceFormAction } from '@attraccess/database-entities';

interface AttractapMessageBaseData<TPayload = unknown> {
  auth?: {
    id: number;
    token: string;
  };
  messageId?: number;
  payload: TPayload;
}

export enum AttractapEventType {
  READER_REGISTER = 'READER_REGISTER',
  READER_AUTHENTICATE = 'READER_AUTHENTICATE',
  READER_UNAUTHORIZED = 'READER_UNAUTHORIZED',
  READER_REQUEST_AUTHENTICATION = 'READER_REQUEST_AUTHENTICATION',
  READER_AUTHENTICATED = 'READER_AUTHENTICATED',
  READER_FIRMWARE_UPDATE_REQUIRED = 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_FIRMWARE_INFO = 'READER_FIRMWARE_INFO',
  READER_CRASH_REPORT = 'READER_CRASH_REPORT',
  FIRMWARE_REQUEST_CHUNK = 'FIRMWARE_REQUEST_CHUNK',
  RESOURCE_LIST = 'RESOURCE_LIST',
  REQUEST_CARD_AUTHENTICATION_DATA = 'REQUEST_CARD_AUTHENTICATION_DATA',
  CARD_AUTHENTICATION_DATA = 'CARD_AUTHENTICATION_DATA',
  START_RESOURCE_USAGE_SESSION = 'START_RESOURCE_USAGE_SESSION',
  STOP_RESOURCE_USAGE_SESSION = 'STOP_RESOURCE_USAGE_SESSION',
  LOCK_DOOR = 'LOCK_DOOR',
  UNLOCK_DOOR = 'UNLOCK_DOOR',
  UNLATCH_DOOR = 'UNLATCH_DOOR',
  ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO = 'ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO',
  ENROLL_NEW_CARD_REQUEST_NFC_KEY = 'ENROLL_NEW_CARD_REQUEST_NFC_KEY',
  ENROLL_NEW_CARD = 'ENROLL_NEW_CARD',
  TRIGGER_FLOW_BUTTON = 'TRIGGER_FLOW_BUTTON',
  BILLING_REQUEST_TOPUP = 'BILLING_REQUEST_TOPUP',
  PROJECTS_OF_USER = 'PROJECTS_OF_USER',
  RESOURCE_USAGE_FORM_REQUEST = 'RESOURCE_USAGE_FORM_REQUEST',
  RESOURCE_USAGE_FORM_GET_FIELDS = 'RESOURCE_USAGE_FORM_GET_FIELDS',
  RESOURCE_USAGE_FORM_FIELDS = 'RESOURCE_USAGE_FORM_FIELDS',
  RESOURCE_USAGE_FORM_SUBMIT_PAGE = 'RESOURCE_USAGE_FORM_SUBMIT_PAGE',
  RESOURCE_USAGE_FORM_PAGE_RESULT = 'RESOURCE_USAGE_FORM_PAGE_RESULT',
}

export interface ReaderCrashReportPayload {
  resetReason: string;
  heapFreeBytes?: number | null;
  largestFreeBlockBytes?: number | null;
  uptimeBeforeResetMs?: number | null;
  wsState?: string | null;
  wifiState?: string | null;
  firmwareVersion?: string | null;
  coredumpBase64?: string | null;
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
  messageCount: number;
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
    ota?: {
      path: string;
      size: number;
      fd?: number;
      lastLoggedPct?: number;
    } | null;
    formDrafts?: Record<string, Record<number, FormFieldAnswerValue>>;
  };
}

// Firmware update related types
export interface FirmwareUpdateStartPayload {
  size: number;
  checksum?: string;
  version?: string;
  is_retry?: boolean;
}

export interface FirmwareRequestChunkPayload {
  offset: number;
  length: number;
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

export type FormFieldAnswerValue = string | number | boolean;

export interface ResourceUsageFormFieldPayload {
  id: number;
  name: string;
  description: string | null;
  type: string;
  isRequired: boolean;
  options: Record<string, unknown> | string[] | null;
  value?: FormFieldAnswerValue | null;
}

export interface ResourceUsageFormMetaPayload {
  id: number;
  name: string;
  fieldCount: number;
}

export interface ResourceUsageFormRequestPayload {
  resourceId: number;
  resourceName?: string;
  action: ResourceFormAction;
  forms: ResourceUsageFormMetaPayload[];
}

export interface ResourceUsageFormGetFieldsPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  limit: number;
}

export interface ResourceUsageFormFieldsPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  totalFieldCount: number;
  fields: ResourceUsageFormFieldPayload[];
}

export interface ResourceUsageFormSubmitPagePayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  answers: { fieldId: number; value: FormFieldAnswerValue }[];
}

export interface ResourceUsageFormPageErrorPayload {
  fieldId: number;
  message: string;
}

export interface ResourceUsageFormPageResultPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  valid: boolean;
  errors: ResourceUsageFormPageErrorPayload[];
}
