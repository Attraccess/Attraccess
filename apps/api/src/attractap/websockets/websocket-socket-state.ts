import type { AttractapReader } from '@attraccess/application-models';
import { ResourceFormAction } from '@attraccess/application-models';
import type { SessionSecurityState } from '../security/session-security-state';
import type { CardConversation } from './card-conversation.service';
import type { BleCapabilityState } from './handlers/ble/ble-wire';
import type { CardSessionState, UiSlotsState, UiStepState } from './handlers/ui/ui-socket-state';
import type { AuditAuthenticationMethod as AuthenticationMethod } from '@attraccess/application-models';

export interface AttractapMessageBaseData<TPayload = unknown> {
  messageId?: number;
  payload: TPayload;
}

export enum AttractapEventType {
  READER_AUTHENTICATED = 'READER_AUTHENTICATED',
  READER_LANGUAGE = 'READER_LANGUAGE',
  READER_FIRMWARE_UPDATE_REQUIRED = 'READER_FIRMWARE_UPDATE_REQUIRED',
  READER_FIRMWARE_INFO = 'READER_FIRMWARE_INFO',
  READER_CRASH_REPORT = 'READER_CRASH_REPORT',
  // Chunked coredump upload (ATT-1144), one message in flight: the reader announces the dump of a report,
  // sends it in chunks and completes it; every reply comes without an ACK round trip.
  READER_COREDUMP_BEGIN = 'READER_COREDUMP_BEGIN',
  READER_COREDUMP_CHUNK = 'READER_COREDUMP_CHUNK',
  READER_COREDUMP_COMPLETE = 'READER_COREDUMP_COMPLETE',
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
  /** Reader → server: the card holder reports a problem ({ resourceId, reason }); answered with success or error. */
  CREATE_MAINTENANCE_REQUEST = 'CREATE_MAINTENANCE_REQUEST',
  /** Reader → server (capabilities.sessionDuration): move the automatic end of the card holder's session later. */
  EXTEND_RESOURCE_USAGE_SESSION = 'EXTEND_RESOURCE_USAGE_SESSION',
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

  // Reader UI (ATT-1187). Wire contract, schema v1:
  //  server -> reader: UI_SLOT_UPDATE, UI_STEP_REQUEST, UI_STEP_CANCEL. The reader acks each with
  //    ACK_<TYPE> echoing `messageId`, which the server matches on for UI_* types only.
  //  reader -> server: UI_STEP_RESULT { stepId, action, cardSessionId }, UI_RENDER_REPORT,
  //    CARD_SESSION_ENDED { cardSessionId }.
  //  START_RESOURCE_USAGE_SESSION gains optional `stepId`, `choice` and `cardSessionId`; replies may carry
  //  { error: 'START_BLOCKED', reason: { code, title, body } }. Host codes in `reason.code`: HOOK_UNAVAILABLE,
  //  CONFIRMATION_UNAVAILABLE, CONFIRMATION_REQUIRED, STEP_EXPIRED, STEP_UNKNOWN, FORM_PHOTO_UNSUPPORTED (also on
  //  STOP_RESOURCE_USAGE_SESSION replies).
  UI_SLOT_UPDATE = 'UI_SLOT_UPDATE',
  UI_STEP_REQUEST = 'UI_STEP_REQUEST',
  UI_STEP_RESULT = 'UI_STEP_RESULT',
  UI_STEP_CANCEL = 'UI_STEP_CANCEL',
  UI_RENDER_REPORT = 'UI_RENDER_REPORT',
  CARD_SESSION_ENDED = 'CARD_SESSION_ENDED',
  // Reserved for phase 7 (custom screens); no handlers, reader messages of these types are dropped.
  UI_SCREEN_OPEN = 'UI_SCREEN_OPEN',
  UI_SCREEN_CLOSE = 'UI_SCREEN_CLOSE',
  UI_SCREEN_DISMISSED = 'UI_SCREEN_DISMISSED',
  UI_ACTION = 'UI_ACTION',

  // Plugin BLE transport (ATT-1033/ATT-1036). Wire contract, protocol v1 (handlers/ble/ble-wire.ts): only on the
  // paired reader link (session transport). Every payload carries `v`, every
  // request a server-assigned `sessionId` and a per-connection `requestId`; bytes are base64. Never ACKed;
  // correlation is by sessionId + requestId only. The reader announces capabilities.ble.
  /** Server → reader: bounded scan with the profile's advertisement filter. Answered by BLE_SCAN_RESULT. */
  BLE_SCAN = 'BLE_SCAN',
  /** Server → reader: connect for a session, with address, deadlines and the profile allowlist the reader enforces. */
  BLE_SESSION_OPEN = 'BLE_SESSION_OPEN',
  /** Server → reader: read one allowlisted characteristic (`s`, `c`). BLE_RESULT carries the bytes as `value`. */
  BLE_READ = 'BLE_READ',
  /** `withoutResponse` writes are pipelined; their BLE_RESULT only frees the API's send window. */
  BLE_WRITE = 'BLE_WRITE',
  /** Notify or indicate; the reader writes the CCCD. Its `requestId` becomes the notifications' `subscriptionId`. */
  BLE_SUBSCRIBE = 'BLE_SUBSCRIBE',
  /** Server → reader: end the subscription of `s`, `c`; the reader clears the CCCD. Answered by BLE_RESULT. */
  BLE_UNSUBSCRIBE = 'BLE_UNSUBSCRIBE',
  /** Server → reader: abandon `requestId` (scan, connect or GATT operation). No answer of its own. */
  BLE_CANCEL = 'BLE_CANCEL',
  /** Server → reader: end the session and disconnect the peripheral. Answered by BLE_RESULT. */
  BLE_SESSION_CLOSE = 'BLE_SESSION_CLOSE',
  /** Reader → server: the one terminal answer to a request: `ok` with `value`/`mtu`, or `error { code, detail }`. */
  BLE_RESULT = 'BLE_RESULT',
  /** Reader → server: the answer to BLE_SCAN, deduplicated by address. */
  BLE_SCAN_RESULT = 'BLE_SCAN_RESULT',
  /** Reader → server: `subscriptionId`, gapless `seq` from 1, and `value` or a stream-ending `error`. */
  BLE_NOTIFICATION = 'BLE_NOTIFICATION',
  /** Reader → server: the reader ended the session itself (peripheral lost, lease, OTA), with `reason` and `detail`. */
  BLE_SESSION_ENDED = 'BLE_SESSION_ENDED',
  // Advertisement watch (capabilities.ble.watch): a passive scan beside sessions, without sessionId.
  /** Server → reader: replace the whole watch set (`requestId`, `filters` `{id, …}`, `keepaliveMs`); `[]` stops it. */
  BLE_WATCH_SET = 'BLE_WATCH_SET',
  /** Reader → server: answer to BLE_WATCH_SET (`requestId`, `ok`, `active` or `error`), or unsolicited without `requestId`. */
  BLE_WATCH_STATE = 'BLE_WATCH_STATE',
  /** Reader → server: up to 8 `events` (advertisement + matched `filters` + `changed`) per message. */
  BLE_WATCH_EVENT = 'BLE_WATCH_EVENT',
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
  /** Image fields only (ATT-879): the link the reader shows as a QR code, the images added so far and the limit. */
  handoffUrl?: string;
  imageCount?: number;
  maxImages?: number;
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
  /**
   * The card's SAK (ISO 14443-3 select answer), when the reader firmware reports it. Bit 0x20 says the card
   * speaks ISO 14443-4 (APDUs). Without it the server cannot tell a UID-only card from a secure one.
   */
  sak?: number;
  /** The card's ATQA, when the reader reports it. Informational. */
  atqa?: number;
}

/** What is still waiting to go out to this reader (session queue for paired readers, `bufferedAmount` otherwise). */
export function queuedSendBytes(socket: Pick<AuthenticatedWebSocket, 'pendingSendBytes' | 'bufferedAmount'>): number {
  return socket.pendingSendBytes?.() ?? socket.bufferedAmount ?? 0;
}

/**
 * Forgets the reader's form answers and which forms it was shown, for every draft key. The two belong together: a
 * fresh draft must start with nothing presented (ATT-796).
 */
export function forgetReaderFormState(socket: Pick<AuthenticatedWebSocket, 'state'>): void {
  socket.state.formDrafts = undefined;
  socket.state.formsPresented = undefined;
  socket.state.formHandoffs = undefined;
}

export interface AuthenticatedWebSocket extends Omit<WebSocket, 'send'> {
  messageCount: number;
  id: string;
  /** The credential this session authenticated with and the build the reader reported. */
  sessionSecurity?: SessionSecurityState;
  /** Set when a session connection sent a plain text frame; nothing from it may be processed. */
  sessionViolation?: boolean;
  /** Drops the connection without a closing handshake. */
  terminate: () => void;
  /**
   * Bytes queued to the reader that have not left yet. Set by the session transport, whose queue lives in
   * TLS rather than the WebSocket; read it through `queuedSendBytes`, which falls back to `bufferedAmount`.
   */
  pendingSendBytes?: () => number;
  readerId: AttractapReader['id'] | null;
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
    /** Reader this socket signs in as while its time zone resolves, so a closing sibling keeps that zone. */
    signingIn?: { readerId: number; attempt: symbol };
    /** The reader runs firmware that relays card APDUs (capabilities.cardRelay, 2.0.0+). Older readers get no card functions. */
    cardRelay?: boolean;
    /**
     * The reader has a duration input and extend controls (capabilities.sessionDuration). Other readers are never
     * refused for the missing estimate: the machine's maximum or default estimate sets their deadline.
     */
    sessionDuration?: boolean;
    /** False for the BLE Bridge (capabilities.nfc): it gets no resource list. Undefined until READER_FIRMWARE_INFO. */
    nfc?: boolean;
    /**
     * Plugin BLE support negotiated from capabilities.ble; undefined until READER_FIRMWARE_INFO arrived. Used only
     * on the paired reader link (the session; pairing connections get no socket state).
     */
    ble?: BleCapabilityState;
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
      auditPrincipal: {
        userId: number;
        authenticationMethod: AuthenticationMethod;
        apiTokenId?: number;
      };
      /** When the enrollment was armed (ms since epoch); a card arriving much later is refused. */
      armedAt: number;
      /** The cluster-wide reader screen claim taken for it (ATT-1163); released when the enrollment ends. */
      screenClaim?: string;
    } | null;
    /** Armed by an admin: the next card tapped on this reader is reset if it is this one. No key material here. */
    resetNfcCardData: {
      cardId: number;
      auditPrincipal: {
        userId: number;
        authenticationMethod: AuthenticationMethod;
        apiTokenId?: number;
      };
      /** When the reset was armed (ms since epoch); a card arriving much later is refused. */
      armedAt: number;
      /** The cluster-wide reader screen claim taken for it (ATT-1163); released when the reset ends. */
      screenClaim?: string;
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
      /** End of the last chunk sent on this connection; a request below it is a duplicate. */
      servedUntil?: number;
    } | null;
    formDrafts?: Record<string, Record<number, FormFieldAnswerValue>>;
    /** Per draft key, the forms already sent to the reader; it shows at most four at a time (ATT-796). */
    formsPresented?: Record<string, number[]>;
    /**
     * The reader announced `capabilities.formImages` (ATT-879): it can show an image field as a QR code. Readers
     * without it never get a field of type `image`.
     */
    formImages?: boolean;
    /** Image fields on screen: the handoff and its token per `resource:action:form:field`. The database holds the rest. */
    formHandoffs?: Record<string, { handoffId: string; token: string }>;
    /** Live card authentication (ATT-1187). Null once the reader reported sign-out or the server expired it. */
    cardSession?: CardSessionState | null;
    /** Open reader UI steps by stepId; discarded when the socket closes. */
    uiSteps?: Map<string, UiStepState>;
    uiSlots?: UiSlotsState;
  };
}
