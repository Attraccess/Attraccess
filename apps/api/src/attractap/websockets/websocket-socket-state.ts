import { Attractap, ResourceFormAction } from '@attraccess/database-entities';
import type { CardConversation } from './card-conversation.service';

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
  READER_LANGUAGE = 'READER_LANGUAGE',
  READER_FIRMWARE_UPDATE_REQUIRED = 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_FIRMWARE_INFO = 'READER_FIRMWARE_INFO',
  READER_CRASH_REPORT = 'READER_CRASH_REPORT',
  /** Server-pushed: asks a token-signed-in reader to open a pairing connection. */
  READER_START_PAIRING = 'READER_START_PAIRING',
  FIRMWARE_REQUEST_CHUNK = 'FIRMWARE_REQUEST_CHUNK',
  RESOURCE_LIST = 'RESOURCE_LIST',
  REQUEST_RESOURCE_LIST = 'REQUEST_RESOURCE_LIST',
  RESOURCE_USAGE_STATS = 'RESOURCE_USAGE_STATS',
  /** Legacy (firmware < 2.0.0): answered with FIRMWARE_UPDATE_REQUIRED. Card keys never leave the server. */
  REQUEST_CARD_AUTHENTICATION_DATA = 'REQUEST_CARD_AUTHENTICATION_DATA',
  CARD_AUTHENTICATION_DATA = 'CARD_AUTHENTICATION_DATA',
  // Two-card supervision (ATT-493): a non-introduced user taps first, then a
  // qualified supervisor either taps their card at the reader OR approves via
  // the web popup (same pending request, two resolution channels).
  SUPERVISION_REQUEST = 'SUPERVISION_REQUEST',
  // Server-pushed (ATT-816): arms the reader to wait for a supervisor card on behalf of a
  // requester who started the flow in the web UI, so nobody has to tap a card first.
  SUPERVISION_START = 'SUPERVISION_START',
  /** Legacy (firmware < 2.0.0). */
  REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA = 'REQUEST_SUPERVISOR_CARD_AUTHENTICATION_DATA',
  SUPERVISOR_CARD_AUTHENTICATION_DATA = 'SUPERVISOR_CARD_AUTHENTICATION_DATA',
  /** Legacy (firmware < 2.0.0): a reader's word that a card was authenticated is never trusted. */
  SUPERVISOR_CARD_AUTH_CONFIRMED = 'SUPERVISOR_CARD_AUTH_CONFIRMED',
  SUPERVISION_RESOLVED = 'SUPERVISION_RESOLVED',
  SUPERVISION_CANCEL = 'SUPERVISION_CANCEL',
  // Card relay (ATT-1145): the API runs the card crypto, the reader only relays complete APDUs.
  /** Reader → server: a card is on the reader. Starts a card conversation for the named purpose. */
  CARD_DETECTED = 'CARD_DETECTED',
  /** Server → reader: one APDU to send to the card. Never ACKed (latency); the answer is CARD_APDU_RESPONSE. */
  CARD_APDU = 'CARD_APDU',
  /** Reader → server: the card's answer to CARD_APDU. */
  CARD_APDU_RESPONSE = 'CARD_APDU_RESPONSE',
  /** Reader → server: the card left the field mid-conversation. */
  CARD_REMOVED = 'CARD_REMOVED',
  /** Server → reader: the conversation is over (the result event was sent before it). */
  CARD_CONVERSATION_END = 'CARD_CONVERSATION_END',
  /** Reader → server: its login ended (logout or timeout); the server forgets the verified user. */
  READER_SESSION_ENDED = 'READER_SESSION_ENDED',
  START_RESOURCE_USAGE_SESSION = 'START_RESOURCE_USAGE_SESSION',
  STOP_RESOURCE_USAGE_SESSION = 'STOP_RESOURCE_USAGE_SESSION',
  LOCK_DOOR = 'LOCK_DOOR',
  UNLOCK_DOOR = 'UNLOCK_DOOR',
  UNLATCH_DOOR = 'UNLATCH_DOOR',
  ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO = 'ENROLL_NEW_CARD_GET_AVAILABLE_KEY_NO',
  /** Legacy (firmware < 2.0.0). */
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
  // Mass introduction (ATT-1151): the server shows a scan screen on a reader; every authenticated
  // card tapped there introduces its owner on behalf of the introducer who started the session.
  MASS_INTRODUCTION_START = 'MASS_INTRODUCTION_START',
  /** Legacy (firmware < 2.0.0). */
  REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA = 'REQUEST_MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA',
  MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA = 'MASS_INTRODUCTION_CARD_AUTHENTICATION_DATA',
  /** Legacy (firmware < 2.0.0). */
  MASS_INTRODUCTION_CARD_AUTH_CONFIRMED = 'MASS_INTRODUCTION_CARD_AUTH_CONFIRMED',
  MASS_INTRODUCTION_RESULT = 'MASS_INTRODUCTION_RESULT',
  /** Reader left the session (cancel button); the QR code keeps working. */
  MASS_INTRODUCTION_CANCEL = 'MASS_INTRODUCTION_CANCEL',
  /** Server ended the session (expired, cancelled by the introducer). */
  MASS_INTRODUCTION_END = 'MASS_INTRODUCTION_END',
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
  requestId?: number;
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

export interface ResourceUsageFormCancelPayload {
  resourceId: number;
  action: ResourceFormAction;
}

export interface ResourceUsageFormPageErrorPayload {
  fieldId: number;
  message: string;
  code?: string;
}

export interface ResourceUsageFormPageResultPayload {
  resourceId: number;
  action: ResourceFormAction;
  formId: number;
  offset: number;
  valid: boolean;
  errors: ResourceUsageFormPageErrorPayload[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AttractapMessage<TPayload = any | undefined> = AttractapEvent<TPayload>;

/** One card presentation on a reader (CARD_DETECTED). `detectionId` is the reader's per-boot counter. */
export interface CardDetection {
  uid: string;
  detectionId: number;
}

export interface AuthenticatedWebSocket extends Omit<WebSocket, 'send'> {
  messageCount: number;
  id: string;
  /** `session` connections carry TLS 1.3 inside binary frames; everything else is legacy. */
  transport?: 'legacy' | 'session';
  /** Set when a session connection sent a plain text frame; nothing from it may be processed. */
  sessionViolation?: boolean;
  /** Drops the connection without a closing handshake. */
  terminate: () => void;
  readerId: Attractap['id'] | null;
  readerName: string | null;
  /**
   * Resolves `true` once the reader ACKed, `false` when every retry timed out. It never rejects, so
   * callers that only fire-and-forget stay unaffected — but anything that depends on the reader
   * having actually received the message (arming supervision, ATT-816) must check the result.
   */
  sendMessage: (message: AttractapMessage) => Promise<boolean>;
  sendBinaryData: (data: Buffer) => void;
  /**
   * Fire-and-forget send without ACK or retries, for latency-critical card APDUs. Returns false
   * when the socket is closed or its send queue is full.
   */
  sendRaw: (message: AttractapMessage) => boolean;
  state: {
    /** Only the latest reader authentication attempt may restore its identity. */
    readerAuthenticationAttempt?: symbol;
    /** The reader runs firmware that relays card APDUs (capabilities.cardRelay, 2.0.0+). Older readers get no card functions. */
    cardRelay?: boolean;
    /**
     * The user whose card this connection verified with the server (EV2 authentication with the
     * stored key). Never set from a UID alone or from anything the reader claims. Cleared on
     * logout, timeout, disconnect and when a new card is tapped.
     */
    verifiedUserId: number | null;
    /** UID of the card behind `verifiedUserId`. */
    verifiedCardUid?: string | null;
    /** Card conversation in progress (managed by CardConversationService). */
    cardConversation?: CardConversation | null;
    /** Newest `detectionId` this connection reported (CARD_DETECTED). Conversations for older detections are refused. */
    latestDetectionId?: number | null;
    /** Detections up to this id were ended (logout, disconnect, cancel) before their conversation could start. */
    abortedDetectionId?: number | null;
    enrollment: {
      userId: number;
      auditPrincipal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };
      /** When the enrollment was armed (ms since epoch); a card arriving much later is refused. */
      armedAt: number;
    } | null;
    /** Armed by an admin: the next card tapped on this reader is reset if it is this one. No key material here. */
    resetNfcCardData: {
      cardId: number;
      auditPrincipal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };
      /** When the reset was armed (ms since epoch); a card arriving much later is refused. */
      armedAt: number;
    } | null;
    // Two-card supervision flow (ATT-493). Present while the reader is waiting
    // for a supervisor to authorise a non-introduced user's session — either by
    // tapping their card at the reader, or by approving the web popup. The
    // requester stays in `verifiedUserId`; the supervisor is tracked
    // here separately so the session starts attributed to the requester with
    // the supervisor attached.
    supervisionFlow?: {
      resourceId: number;
      requesterUserId: number;
      /** The in-memory supervision request id shared with the web-approval channel (null until created). */
      requestId: string | null;
      /** Set once a supervisor card has been validated at the reader; consumed by the session-start handler. */
      approvedSupervisorUserId: number | null;
      /**
       * True when the flow was armed from the web UI (ATT-816) rather than by a card tap. The
       * requester is not present at the reader, so the reader must not start the session itself —
       * it confirms the card auth instead and the pending web request is approved server-side.
       */
      webInitiated?: boolean;
    } | null;
    /** Present while the reader shows a mass-introduction scan screen (ATT-1151). */
    massIntroductionFlow?: {
      sessionId: string;
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
