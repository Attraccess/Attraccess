export interface AttractapMessageBaseData<TPayload = unknown> {
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
  REQUEST_RESOURCE_LIST = 'REQUEST_RESOURCE_LIST',
  RESOURCE_USAGE_STATS = 'RESOURCE_USAGE_STATS',
  REQUEST_CARD_AUTHENTICATION_DATA = 'REQUEST_CARD_AUTHENTICATION_DATA',
  CARD_AUTHENTICATION_DATA = 'CARD_AUTHENTICATION_DATA',
  // Two-card supervision (ATT-493): a non-introduced user taps first, then a
  // qualified supervisor either taps their card at the reader OR approves via
  // the web popup (same pending request, two resolution channels).
  SUPERVISION_REQUEST = 'SUPERVISION_REQUEST',
  // Server-pushed (ATT-816): arms the reader to wait for a supervisor card on behalf of a
  // requester who started the flow in the web UI, so nobody has to tap a card first.
  SUPERVISION_START = 'SUPERVISION_START',
  REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA = 'REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA',
  SUPERVISOR_CARD_AUTHENTICATION_DATA = 'SUPERVISOR_CARD_AUTHENTICATION_DATA',
  // Reader confirms it crypto-authenticated the supervisor card (ATT-816). Only sent for
  // web-initiated flows, where the reader must not start the session itself.
  SUPERVISOR_CARD_AUTH_CONFIRMED = 'SUPERVISOR_CARD_AUTH_CONFIRMED',
  SUPERVISION_RESOLVED = 'SUPERVISION_RESOLVED',
  SUPERVISION_CANCEL = 'SUPERVISION_CANCEL',
  START_RESOURCE_USAGE_SESSION = 'START_RESOURCE_USAGE_SESSION',
  STOP_RESOURCE_USAGE_SESSION = 'STOP_RESOURCE_USAGE_SESSION',
  LOCK_DOOR = 'LOCK_DOOR',
  UNLOCK_DOOR = 'UNLOCK_DOOR',
  UNLATCH_DOOR = 'UNLATCH_DOOR',
  ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO = 'ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO',
  ENROLL_NEW_CARD_REQUEST_NFC_KEY = 'ENROLL_NEW_CARD_REQUEST_NFC_KEY',
  ENROLL_NEW_CARD = 'ENROLL_NEW_CARD',
  ENROLL_NEW_CARD_CANCEL = 'ENROLL_NEW_CARD_CANCEL',
  RESET_NFC_CARD = 'RESET_NFC_CARD',
  RESET_NFC_CARD_CANCEL = 'RESET_NFC_CARD_CANCEL',
  TRIGGER_FLOW_BUTTON = 'TRIGGER_FLOW_BUTTON',
  BILLING_REQUEST_TOPUP = 'BILLING_REQUEST_TOPUP',
  PROJECTS_OF_USER = 'PROJECTS_OF_USER',
  RESOURCE_USAGE_FORM_REQUEST = 'RESOURCE_USAGE_FORM_REQUEST',
  RESOURCE_USAGE_FORM_GET_FIELDS = 'RESOURCE_USAGE_FORM_GET_FIELDS',
  RESOURCE_USAGE_FORM_FIELDS = 'RESOURCE_USAGE_FORM_FIELDS',
  RESOURCE_USAGE_FORM_SUBMIT_PAGE = 'RESOURCE_USAGE_FORM_SUBMIT_PAGE',
  RESOURCE_USAGE_FORM_PAGE_RESULT = 'RESOURCE_USAGE_FORM_PAGE_RESULT',
  RESOURCE_USAGE_FORM_CANCEL = 'RESOURCE_USAGE_FORM_CANCEL',
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
