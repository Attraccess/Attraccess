import type {
  AuthenticatedSession,
  AuthenticatedSessionUser,
  LogoutSession,
  SessionMetadata,
  SessionStats,
  SsoLogoutReceipt,
  SsoSessionContext,
  SsoSessionSelector,
  UserSessionSummary,
} from '@attraccess/application-models';

export type {
  AuthenticatedSession,
  LogoutSession,
  SessionMetadata,
  SessionStats,
  SsoLogoutReceipt,
  UserSessionSummary,
} from '@attraccess/application-models';

export const SESSION_STORE = 'SESSION_STORE';

/**
 * Where sessions live (the database, or Valkey). The contract speaks neutral models only; implementations own
 * their storage, conversions and atomicity (rotation, revocation and logout receipts are one atomic step each).
 */
export interface SessionStore {
  authenticateSession(token: string): Promise<AuthenticatedSession | null>;
  getLogoutSession(token: string): Promise<LogoutSession | null>;
  revokeLogoutSession(id: string): Promise<boolean>;
  createSession(
    hashedToken: string,
    userId: number,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
  ): Promise<void>;
  getSsoContext(token: string): Promise<SsoSessionContext | null>;
  /** Replaces a live session's SSO context only while it still equals `expected` (claims a re-sync). */
  compareAndSetSsoContext(id: string, expected: SsoSessionContext, next: SsoSessionContext): Promise<boolean>;
  /**
   * Records the receipt and revokes the matching sessions in one atomic step, so a notification is applied exactly
   * once. Unsigned notifications require a match to bound retained receipts by revoked active sessions.
   */
  revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: SsoLogoutReceipt,
  ): Promise<{ fresh: boolean; count: number }>;
  revokeSsoSessions(selector: SsoSessionSelector): Promise<number>;
  putLogoutState(key: string, value: string, expiresAt: number): Promise<boolean>;
  takeLogoutState(key: string): Promise<string | null>;
  /** Generic short-lived state; same insert-if-absent semantics as `putLogoutState`. */
  putEphemeralState(key: string, value: string, expiresAt: number): Promise<boolean>;
  /** Reads live state without consuming it. */
  getEphemeralState(key: string): Promise<string | null>;
  /** Atomically adds one to a counter that expires at `expiresAt` (epoch ms) and returns the new value. */
  incrementEphemeralCounter(key: string, expiresAt: number): Promise<number>;
  validateSession(token: string): Promise<AuthenticatedSessionUser | null>;
  /** Replaces the token of a live session; false when it is gone or expired (rotation is idempotent per token). */
  rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean>;
  revokeSession(token: string): Promise<boolean>; // true = was active
  revokeAllUserSessions(userId: number): Promise<number>; // count of active sessions removed
  cleanupExpired(): Promise<{ remainingActive: number } | null>; // null = TTL-managed, no cleanup needed
  getUserSessions(userId: number): Promise<UserSessionSummary[]>;
  getStats(): Promise<SessionStats>;
  countActive(): Promise<number>;
}
