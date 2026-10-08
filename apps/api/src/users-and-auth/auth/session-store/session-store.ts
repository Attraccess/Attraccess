import { Session, User, SsoSessionContext } from '@attraccess/database-entities';

import { SsoSessionSelector } from './sso-session-selector';

export const SESSION_STORE = 'SESSION_STORE';

export interface SessionMetadata {
  ssoContext?: SsoSessionContext;
  userAgent?: string;
  ipAddress?: string;
  expiresIn?: number; // seconds
}

export interface SessionStore {
  createSession(
    hashedToken: string,
    userId: number,
    metadata: SessionMetadata | undefined,
    expiresAt: Date,
  ): Promise<void>;
  getSsoContext(token: string): Promise<SsoSessionContext | null>;
  revokeSsoSessionsOnce(
    selector: SsoSessionSelector,
    receipt: { key: string; expiresAt: number },
  ): Promise<{ fresh: boolean; count: number }>;
  revokeSsoSessions(selector: SsoSessionSelector): Promise<number>;
  putLogoutState(key: string, value: string, expiresAt: number): Promise<boolean>;
  takeLogoutState(key: string): Promise<string | null>;
  validateSession(token: string): Promise<User | null>;
  rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean>;
  revokeSession(token: string): Promise<boolean>; // true = was active
  revokeAllUserSessions(userId: number): Promise<number>; // count of active sessions removed
  cleanupExpired(): Promise<{ remainingActive: number } | null>; // null = TTL-managed, no cleanup needed
  getUserSessions(userId: number): Promise<Session[]>;
  getStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }>;
  countActive(): Promise<number>;
}
