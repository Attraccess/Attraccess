import { Session, User } from '@attraccess/database-entities';

export const SESSION_STORE = 'SESSION_STORE';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
  expiresIn?: number; // seconds
}

export interface SessionStore {
  createSession(hashedToken: string, userId: number, metadata: SessionMetadata | undefined, expiresAt: Date): Promise<void>;
  validateSession(token: string): Promise<User | null>;
  rotateSession(token: string, newHashedToken: string, newExpiresAt: Date): Promise<boolean>;
  revokeSession(token: string): Promise<boolean>; // true = was active
  revokeAllUserSessions(userId: number): Promise<number>; // count of active sessions removed
  cleanupExpired(): Promise<{ remainingActive: number } | null>; // null = TTL-managed, no cleanup needed
  getUserSessions(userId: number): Promise<Session[]>;
  getStats(): Promise<{ totalActiveSessions: number; expiredSessions: number }>;
  countActive(): Promise<number>;
}
