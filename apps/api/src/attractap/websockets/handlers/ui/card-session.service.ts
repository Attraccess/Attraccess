import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { AuthenticatedWebSocket } from '../../websocket-socket-state';
import type { CardSessionState } from './ui-socket-state';

/** Reader-side sign-out timeout (firmware UNLOCKED_TIMEOUT_MS). */
export const UNLOCKED_TIMEOUT_MS = 30_000;
export const CARD_SESSION_GRACE_MS = 5_000;

/** `reader`: CARD_SESSION_ENDED; `expired`: server timer; `disconnect`: socket closed (listeners are not told). */
export type CardSessionEndReason = 'reader' | 'expired' | 'disconnect';
type StartedListener = (
  socket: AuthenticatedWebSocket,
  session: CardSessionState,
  previous: CardSessionState | null,
) => void;
type EndedListener = (socket: AuthenticatedWebSocket, session: CardSessionState, reason: CardSessionEndReason) => void;

/**
 * Tracks the card authentication behind reader actions (ATT-1187). The reader restarts its sign-in timeout on
 * every touch and pauses it during forms, so reader messages that carry the card session id keep it alive
 * (`resume`). The server also expires a card session itself, unless a step is still open.
 */
@Injectable()
export class CardSessionService {
  private readonly started: StartedListener[] = [];
  private readonly ended: EndedListener[] = [];
  /** The last session the server timer expired, revivable by its own reader while nothing newer exists. */
  private readonly expired = new WeakMap<AuthenticatedWebSocket, CardSessionState>();
  private readonly deadlines = new WeakMap<CardSessionState, number>();

  onStarted(listener: StartedListener): void {
    this.started.push(listener);
  }

  onEnded(listener: EndedListener): void {
    this.ended.push(listener);
  }

  current(socket: AuthenticatedWebSocket): CardSessionState | null {
    return socket.state.cardSession ?? null;
  }

  isLive(socket: AuthenticatedWebSocket, cardSessionId: string): boolean {
    return socket.state.cardSession?.id === cardSessionId;
  }

  issue(socket: AuthenticatedWebSocket, userId: number, language: 'en' | 'de'): CardSessionState {
    const previous = socket.state.cardSession ?? null;
    if (previous?.expiryTimer) clearTimeout(previous.expiryTimer);
    this.expired.delete(socket);
    const session: CardSessionState = {
      id: randomBytes(12).toString('base64url'),
      userId,
      language,
      issuedAt: Date.now(),
      expiryTimer: null,
    };
    socket.state.cardSession = session;
    this.arm(socket, session, UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS);
    this.started.forEach((listener) => listener(socket, session, previous));
    return session;
  }

  /**
   * A reader message carried this card session id: the reader is still signed in, so the timer restarts.
   * If the server timer already expired it, the same session comes back, but only for the same user and only
   * while no newer card session was issued and the reader did not end it.
   */
  resume(socket: AuthenticatedWebSocket, cardSessionId: unknown, userId: number | null | undefined): boolean {
    if (typeof cardSessionId !== 'string' || userId == null) return false;
    const live = socket.state.cardSession;
    if (live) {
      if (live.id !== cardSessionId || live.userId !== userId) return false;
      this.arm(socket, live, UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS);
      return true;
    }
    const expired = this.expired.get(socket);
    if (!expired || expired.id !== cardSessionId || expired.userId !== userId) return false;
    this.expired.delete(socket);
    socket.state.cardSession = expired;
    this.arm(socket, expired, UNLOCKED_TIMEOUT_MS + CARD_SESSION_GRACE_MS);
    this.started.forEach((listener) => listener(socket, expired, null));
    return true;
  }

  /** Reader reported "card session ended", the server timer fired, or the socket closed. */
  end(socket: AuthenticatedWebSocket, cardSessionId: string | null, reason: CardSessionEndReason): boolean {
    if (reason !== 'expired' && (cardSessionId === null || this.expired.get(socket)?.id === cardSessionId)) {
      this.expired.delete(socket);
    }
    const session = socket.state?.cardSession;
    if (!session || (cardSessionId !== null && session.id !== cardSessionId)) return false;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    session.expiryTimer = null;
    socket.state.cardSession = null;
    if (reason === 'disconnect') return true;
    if (reason === 'expired') this.expired.set(socket, session);
    this.ended.forEach((listener) => listener(socket, session, reason));
    return true;
  }

  /** Called when a step closes: the card session may now run out, but never sooner than already planned. */
  rearm(socket: AuthenticatedWebSocket): void {
    const session = socket.state.cardSession;
    if (!session) return;
    const remaining = (this.deadlines.get(session) ?? 0) - Date.now();
    this.arm(socket, session, Math.max(remaining, CARD_SESSION_GRACE_MS * 2));
  }

  private arm(socket: AuthenticatedWebSocket, session: CardSessionState, afterMs: number): void {
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    this.deadlines.set(session, Date.now() + afterMs);
    session.expiryTimer = setTimeout(() => {
      if (socket.state.cardSession?.id !== session.id) return;
      if (socket.state.uiSteps && socket.state.uiSteps.size > 0) {
        this.arm(socket, session, CARD_SESSION_GRACE_MS * 2);
        return;
      }
      this.end(socket, session.id, 'expired');
    }, afterMs);
    session.expiryTimer.unref?.();
  }
}
