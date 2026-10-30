import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { MAX_RELAYED_COMMAND_LENGTH } from '../card-crypto';
import type { CardChannel } from '../card-crypto/card-operations';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

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
  abort: (reason: CardConversationFailure) => void;
}

/**
 * Runs card conversations for readers that only relay APDUs. The reader sends CARD_DETECTED, the
 * server drives the card one APDU at a time (CARD_APDU / CARD_APDU_RESPONSE) and ends it with
 * CARD_CONVERSATION_END. Each message carries the server-assigned conversation id and a sequence
 * number the reader echoes; anything that does not match is ignored.
 */
@Injectable()
export class CardConversationService {
  private readonly logger = new Logger(CardConversationService.name);
  private active = 0;

  get activeConversations(): number {
    return this.active;
  }

  /**
   * Starts a conversation on this connection and runs `work` on it. A conversation already running
   * on the connection is aborted first (a new tap). Resolves with BUSY when the server is at its
   * limit or the reader's send queue is full.
   */
  async run<T>(
    socket: AuthenticatedWebSocket,
    purpose: string,
    uid: string,
    work: (channel: CardChannel) => Promise<T>,
  ): Promise<CardConversationResult<T>> {
    this.abort(socket, 'CARD_REMOVED');
    // A new login tap ends the previous one. Supervisor and mass-introduction cards act next to it.
    if (purpose === 'tap') {
      socket.state.verifiedUserId = null;
      socket.state.verifiedCardUid = null;
    }

    if (this.active >= CARD_CONVERSATION_LIMITS.maxConcurrent || this.queueIsFull(socket)) {
      return { ok: false, reason: 'BUSY' };
    }

    this.active++;
    const conversation = this.open(socket, purpose);
    socket.state.cardConversation = conversation;

    const channel: CardChannel = {
      uid,
      exchange: (apdu) => this.exchange(socket, conversation, apdu),
    };

    try {
      const value = await work(channel);
      return { ok: true, value };
    } catch (error) {
      if (error instanceof CardConversationError) return { ok: false, reason: error.reason };
      throw error;
    } finally {
      this.close(socket, conversation);
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
    if (typeof response !== 'string' || !/^([0-9a-f]{2})+$/i.test(response)) {
      this.logger.debug(`Ignoring malformed card response from client ${socket.id}`);
      return;
    }
    const bytes = Buffer.from(response, 'hex');
    if (bytes.length > CARD_CONVERSATION_LIMITS.maxResponseLength) {
      this.logger.debug(`Ignoring oversized card response from client ${socket.id}`);
      return;
    }
    clearTimeout(pending.timer);
    conversation.pending = null;
    pending.resolve(bytes);
  }

  /** Reader → server: the card left the field. */
  handleRemoved(socket: AuthenticatedWebSocket, payload: unknown): void {
    const conversation = socket.state.cardConversation;
    const { conversationId } = (payload ?? {}) as { conversationId?: unknown };
    if (!conversation || conversation.id !== conversationId) return;
    conversation.abort('CARD_REMOVED');
  }

  /** Aborts a running conversation (logout, timeout, disconnect, new tap). */
  abort(socket: AuthenticatedWebSocket, reason: CardConversationFailure): void {
    socket.state?.cardConversation?.abort(reason);
  }

  private queueIsFull(socket: AuthenticatedWebSocket): boolean {
    return (socket.bufferedAmount ?? 0) > CARD_CONVERSATION_LIMITS.maxBufferedBytes;
  }

  private open(socket: AuthenticatedWebSocket, purpose: string): CardConversation {
    const conversation: CardConversation = {
      id: randomBytes(6).toString('hex'),
      purpose,
      exchanges: 0,
      nextSeq: 1,
      pending: null,
      ended: false,
      deadline: setTimeout(() => conversation.abort('TIMEOUT'), CARD_CONVERSATION_LIMITS.conversationTimeoutMs),
      abort: (reason) => {
        if (conversation.ended) return;
        conversation.ended = true;
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

  private close(socket: AuthenticatedWebSocket, conversation: CardConversation): void {
    clearTimeout(conversation.deadline);
    if (conversation.pending) clearTimeout(conversation.pending.timer);
    conversation.pending = null;
    conversation.ended = true;
    this.active--;
    if (socket.state.cardConversation === conversation) socket.state.cardConversation = null;
    socket.sendRaw?.(new AttractapEvent(AttractapEventType.CARD_CONVERSATION_END, { conversationId: conversation.id }));
  }

  private exchange(socket: AuthenticatedWebSocket, conversation: CardConversation, apdu: Buffer): Promise<Buffer> {
    if (conversation.ended) return Promise.reject(new CardConversationError('CARD_REMOVED'));
    if (conversation.pending) return Promise.reject(new Error('card exchange already in flight'));
    if (apdu.length > MAX_RELAYED_COMMAND_LENGTH) return Promise.reject(new Error('APDU does not fit the PN532'));
    if (conversation.exchanges >= CARD_CONVERSATION_LIMITS.maxExchanges) {
      conversation.abort('TOO_MANY_EXCHANGES');
      return Promise.reject(new CardConversationError('TOO_MANY_EXCHANGES'));
    }
    if (this.queueIsFull(socket)) return Promise.reject(new CardConversationError('BUSY'));

    conversation.exchanges++;
    const seq = conversation.nextSeq++;
    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        conversation.pending = null;
        conversation.ended = true;
        reject(new CardConversationError('TIMEOUT'));
      }, CARD_CONVERSATION_LIMITS.exchangeTimeoutMs);
      conversation.pending = { seq, resolve, reject, timer };
      const sent = socket.sendRaw(
        new AttractapEvent(AttractapEventType.CARD_APDU, {
          conversationId: conversation.id,
          seq,
          apdu: apdu.toString('hex'),
        }),
      );
      if (!sent) {
        clearTimeout(timer);
        conversation.pending = null;
        conversation.ended = true;
        reject(new CardConversationError('READER_UNREACHABLE'));
      }
    });
  }
}
