import { Attractap } from '@attraccess/database-entities';
import { AttractapMessage } from './websocket-event';
import { FormFieldAnswerValue } from './websocket-form-payloads';

export interface AuthenticatedWebSocket extends Omit<WebSocket, 'send'> {
  messageCount: number;
  id: string;
  readerId: Attractap['id'] | null;
  readerName: string | null;
  /**
   * Resolves `true` once the reader ACKed, `false` when every retry timed out. It never rejects, so
   * callers that only fire-and-forget stay unaffected — but anything that depends on the reader
   * having actually received the message (arming supervision, ATT-816) must check the result.
   */
  sendMessage: (message: AttractapMessage) => Promise<boolean>;
  sendBinaryData: (data: Buffer) => void;
  state: {
    lastAuthenticatedUserId: number | null;
    enrollment: {
      userId: number;
      auditPrincipal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };
    } | null;
    enrollNewCardData: {
      userId: number;
      key: string;
      keyNo: number;
      cardUID: string;
      auditPrincipal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };
    } | null;
    resetNfcCardData: {
      cardId: number;
      key: string;
      keyNo: number;
      auditPrincipal: { userId: number; authenticationMethod: 'session' | 'api-token'; apiTokenId?: number };
    } | null;
    // Two-card supervision flow (ATT-493). Present while the reader is waiting
    // for a supervisor to authorise a non-introduced user's session — either by
    // tapping their card at the reader, or by approving the web popup. The
    // requester stays in `lastAuthenticatedUserId`; the supervisor is tracked
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
    ota?: {
      path: string;
      size: number;
      fd?: number;
      lastLoggedPct?: number;
    } | null;
    formDrafts?: Record<string, Record<number, FormFieldAnswerValue>>;
  };
}
