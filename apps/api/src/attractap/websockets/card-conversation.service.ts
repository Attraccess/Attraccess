import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { MAX_RELAYED_COMMAND_LENGTH } from '../card-crypto';
import type { CardChannel } from '../card-crypto/card-operations';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket, CardDetection } from './websocket.types';

/**
 * Limits sized for 1,000 readers with 250 tapping at once (to be tuned by the load test).
 * One conversation per reader, a bounded number server-wide.
 */
export const CARD_CONVERSATION_LIMITS = {
  maxConcurrent: 400,
  maxExchanges: 32,
  exchangeTimeoutMs: 3000,
  conversationTimeoutMs: 15000,
  /** A reader that cannot drain its socket this fast is treated as busy. */
  maxBufferedBytes: 32 * 1024,
  /** The longest card answer worth reading (PN532 buffer). */
  maxResponseLength: 64,
};

export type CardConversationFailure =
  'BUSY' | 'CARD_REMOVED' | 'TIMEOUT' | 'TOO_MANY_EXCHANGES' | 'READER_UNREACHABLE' | 'READER_SESSION_ENDED';

export class CardConversationError extends Error {
  constructor(public readonly reason: CardConversationFailure) {
    super(reason);
  }
}

/** The API compiles without strict null checks, so this is a plain shape instead of a discriminated union. */
export interface CardConversationResult<T> {
  ok: boolean;
  value?: T;
  reason?: CardConversationFailure;
}

export interface CardConversation {
  readonly id: string;
  readonly purpose: string;
  readonly detectionId: number;
  exchanges: number;
  nextSeq: number;
  pending: {
    seq: number;
    resolve: (response: Buffer) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  } | null;
  readonly deadline: NodeJS.Timeout;
  ended: boolean;
  /** Why the conversation was cut short (new tap, logout, disconnect, removal, limits). Null while it runs or when it finished normally. */
  abortReason: CardConversationFailure | null;
  abort: (reason: CardConversationFailure) => void;
}

/**
 * Runs card conversations for readers that only relay APDUs. The reader sends CARD_DETECTED, the
 * server drives the card one APDU at a time (CARD_APDU / CARD_APDU_RESPONSE) and ends it with
 * CARD_CONVERSATION_END. Each message carries the reader's detection id, the server-assigned
 * conversation id and a sequence number the reader echoes; anything that does not match is ignored.
 */
@Injectable()
export class CardConversationService {
  private readonly logger = new Logger(CardConversationService.name);
  private active = 0;
  /** One conversation per reader, even when the reader has more than one connection. */
  private readonly byReader = new Map<number, CardConversation>();

  get activeConversations(): number {
    return this.active;
  }

  /**
   * Cheap check before any database work: would a new conversation on this connection be refused
   * with BUSY right now (server-wide limit reached or the reader's send queue full)?
   */
  isBusy(socket: AuthenticatedWebSocket): boolean {
    return this.active >= CARD_CONVERSATION_LIMITS.maxConcurrent || this.queueIsFull(socket);
  }

  /**
   * The reader reported a new card presentation. Anything still running for an older presentation
   * is over: the reader only relays for its newest detection.
   */
  noteDetection(socket: AuthenticatedWebSocket, detectionId: number): void {
    const latest = socket.state.latestDetectionId;
    if (latest == null || detectionId > latest) socket.state.latestDetectionId = detectionId;
    const conversation = socket.state.cardConversation;
    if (conversation && conversation.detectionId < detectionId) conversation.abort('CARD_REMOVED');
  }

  /**
   * Starts a conversation for one card presentation and runs `work` on it. A conversation already
   * running for this reader (on this or another connection) is aborted first. Resolves with BUSY
   * when the server is at its limit or the reader's send queue is full, and with a failure when the
   * conversation was aborted before `work` finished — even if `work` resolved afterwards.
   */
  async run<T>(
    socket: AuthenticatedWebSocket,
    purpose: string,
    detection: CardDetection,
    work: (channel: CardChannel) => Promise<T>,
  ): Promise<CardConversationResult<T>> {
    const { detectionId } = detection;
    const latest = socket.state.latestDetectionId;
    // A newer card presentation already took over this reader: this one is gone.
    if (latest != null && detectionId < latest) return { ok: false, reason: 'CARD_REMOVED' };
    const aborted = socket.state.abortedDetectionId;
    if (aborted != null && detectionId <= aborted) return { ok: false, reason: 'CARD_REMOVED' };
    socket.state.latestDetectionId = detectionId;

    socket.state.cardConversation?.abort('CARD_REMOVED');
    const readerId = socket.readerId;
    if (readerId != null) this.byReader.get(readerId)?.abort('CARD_REMOVED');

    if (this.isBusy(socket)) return { ok: false, reason: 'BUSY' };

    this.active++;
    const conversation = this.open(purpose, detectionId);
    socket.state.cardConversation = conversation;
    if (readerId != null) this.byReader.set(readerId, conversation);

    const channel: CardChannel = {
      uid: detection.uid,
      exchange: (apdu) => this.exchange(socket, conversation, apdu),
    };

    try {
      const value = await work(channel);
      // Enroll/reset results are database writes that already happened: report them as they are.
      // A read-only check (tap, supervisor, mass introduction) aborted meanwhile must not count.
      const writes = purpose === 'enroll' || purpose === 'reset';
      if (conversation.abortReason && !writes) return { ok: false, reason: conversation.abortReason };
      return { ok: true, value };
    } catch (error) {
      if (conversation.abortReason) return { ok: false, reason: conversation.abortReason };
      if (error instanceof CardConversationError) return { ok: false, reason: error.reason };
      throw error;
    } finally {
      this.close(socket, conversation, readerId);
    }
  }

  /** Reader → server: the card's answer to the last CARD_APDU. */
  handleResponse(socket: AuthenticatedWebSocket, payload: unknown): void {
    const conversation = socket.state.cardConversation;
    const { conversationId, seq, response } = (payload ?? {}) as {
      conversationId?: unknown;
      seq?: unknown;
      response?: unknown;
    };
    const pending = conversation?.pending;
    if (!conversation || !pending || conversation.id !== conversationId || pending.seq !== seq) {
      this.logger.debug(`Ignoring unexpected card response from client ${socket.id}`);
      return;
    }
    // Length first: the pattern test below is linear in the input, so a huge string never reaches it.
    if (typeof response !== 'string' || response.length > 2 * CARD_CONVERSATION_LIMITS.maxResponseLength) {
      this.logger.debug(`Ignoring oversized card response from client ${socket.id}`);
      return;
    }
    if (!/^([0-9a-f]{2})+$/i.test(response)) {
      this.logger.debug(`Ignoring malformed card response from client ${socket.id}`);
      return;
    }
    clearTimeout(pending.timer);
    conversation.pending = null;
    pending.resolve(Buffer.from(response, 'hex'));
  }

  /** Reader → server: the card left the field. */
  handleRemoved(socket: AuthenticatedWebSocket, payload: unknown): void {
    const conversation = socket.state.cardConversation;
    const { conversationId } = (payload ?? {}) as { conversationId?: unknown };
    if (!conversation || conversation.id !== conversationId) return;
    conversation.abort('CARD_REMOVED');
  }

  /**
   * Aborts a running conversation (logout, timeout, disconnect, cancel). The newest card presentation
   * is ended too, so a conversation for it that has not started yet (database lookups) never runs.
   * With `purpose`, only a conversation for that purpose is affected.
   */
  abort(socket: AuthenticatedWebSocket, reason: CardConversationFailure, purpose?: string): void {
    const state = socket.state;
    if (!state) return;
    const conversation = state.cardConversation;
    if (purpose && conversation && conversation.purpose !== purpose) return;
    if (state.latestDetectionId != null) state.abortedDetectionId = state.latestDetectionId;
    conversation?.abort(reason);
  }

  private queueIsFull(socket: AuthenticatedWebSocket): boolean {
    return (socket.bufferedAmount ?? 0) > CARD_CONVERSATION_LIMITS.maxBufferedBytes;
  }

  private open(purpose: string, detectionId: number): CardConversation {
    const conversation: CardConversation = {
      id: randomBytes(6).toString('hex'),
      purpose,
      detectionId,
      exchanges: 0,
      nextSeq: 1,
      pending: null,
      ended: false,
      abortReason: null,
      deadline: setTimeout(() => conversation.abort('TIMEOUT'), CARD_CONVERSATION_LIMITS.conversationTimeoutMs),
      abort: (reason) => {
        if (conversation.ended) return;
        conversation.ended = true;
        conversation.abortReason = reason;
        const pending = conversation.pending;
        conversation.pending = null;
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(new CardConversationError(reason));
        }
      },
    };
    return conversation;
  }

  private close(socket: AuthenticatedWebSocket, conversation: CardConversation, readerId: number | null): void {
    clearTimeout(conversation.deadline);
    if (conversation.pending) clearTimeout(conversation.pending.timer);
    conversation.pending = null;
    conversation.ended = true;
    this.active--;
    if (socket.state.cardConversation === conversation) socket.state.cardConversation = null;
    if (readerId != null && this.byReader.get(readerId) === conversation) this.byReader.delete(readerId);
    socket.sendRaw?.(
      new AttractapEvent(AttractapEventType.CARD_CONVERSATION_END, {
        conversationId: conversation.id,
        detectionId: conversation.detectionId,
      }),
    );
  }

  private exchange(socket: AuthenticatedWebSocket, conversation: CardConversation, apdu: Buffer): Promise<Buffer> {
    if (conversation.ended) {
      return Promise.reject(new CardConversationError(conversation.abortReason ?? 'CARD_REMOVED'));
    }
    if (conversation.pending) return Promise.reject(new Error('card exchange already in flight'));
    if (apdu.length > MAX_RELAYED_COMMAND_LENGTH) return Promise.reject(new Error('APDU does not fit the PN532'));
    const refuse = (reason: CardConversationFailure) => {
      conversation.abort(reason);
      return Promise.reject(new CardConversationError(reason));
    };
    if (conversation.exchanges >= CARD_CONVERSATION_LIMITS.maxExchanges) return refuse('TOO_MANY_EXCHANGES');
    if (this.queueIsFull(socket)) return refuse('BUSY');

    conversation.exchanges++;
    const seq = conversation.nextSeq++;
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => conversation.abort('TIMEOUT'), CARD_CONVERSATION_LIMITS.exchangeTimeoutMs);
      conversation.pending = { seq, resolve, reject, timer };
      const sent = socket.sendRaw(
        new AttractapEvent(AttractapEventType.CARD_APDU, {
          conversationId: conversation.id,
          detectionId: conversation.detectionId,
          seq,
          apdu: apdu.toString('hex'),
        }),
      );
      if (!sent) conversation.abort('READER_UNREACHABLE');
    });
  }
}
