import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { AuthenticatedWebSocket } from '../../websocket-socket-state';
import type { CardSessionState } from './ui-socket-state';

/** Reader-side sign-out timeout (firmware UNLOCKED_TIMEOUT_MS). */
export const UNLOCKED_TIMEOUT_MS = 30_000;
export const CARD_SESSION_GRACE_MS = 5_000;

export type CardSessionEndReason = 'reader' | 'expired' | 'replaced' | 'disconnect';
type StartedListener = (
  socket: AuthenticatedWebSocket,
  session: CardSessionState,
  previous: CardSessionState | null,
) => void;
type EndedListener = (socket: AuthenticatedWebSocket, session: CardSessionState, reason: CardSessionEndReason) => void;

/**
 * Tracks the card authentication behind reader actions (ATT-1187). The reader never told the server when it
 * signed a user out, so the server also expires a card session itself, unless a step is still open.
 */
@Injectable()
export class CardSessionService {
  private readonly started: StartedListener[] = [];
  private readonly ended: EndedListener[] = [];

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

  /** Reader reported "card session ended", the server timer fired, or the socket closed. */
  end(socket: AuthenticatedWebSocket, cardSessionId: string | null, reason: CardSessionEndReason): boolean {
    const session = socket.state.cardSession;
    if (!session || (cardSessionId !== null && session.id !== cardSessionId)) return false;
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
    socket.state.cardSession = null;
    this.ended.forEach((listener) => listener(socket, session, reason));
    return true;
  }

  /** Called when a step closes: the card session may now run out. */
  rearm(socket: AuthenticatedWebSocket): void {
    const session = socket.state.cardSession;
    if (session) this.arm(socket, session, CARD_SESSION_GRACE_MS * 2);
  }

  private arm(socket: AuthenticatedWebSocket, session: CardSessionState, afterMs: number): void {
    if (session.expiryTimer) clearTimeout(session.expiryTimer);
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
