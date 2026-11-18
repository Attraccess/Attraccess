import type { SsoSessionContext } from './sso-session-context';

/**
 * The signed-in account a session belongs to. Neutral shape of the account row: the session adapters hand the
 * stored account to the authentication layer without exposing the persistence model.
 */
export interface AuthenticatedSessionUser {
  id: number;
  username: string;
  email: string;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  lastUsernameChangeAt: Date | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  firstFailedLoginAt: Date | null;
  emailVerificationToken: string | null;
  emailVerificationTokenExpiresAt: Date | null;
  passwordResetToken: string | null;
  passwordResetTokenExpiresAt: Date | null;
  deleteAccountToken: string | null;
  deleteAccountTokenExpiresAt: Date | null;
  deleteAccountRequestedAt: Date | null;
  nfcKeySeedToken: string | null;
}

export interface SessionMetadata {
  ssoContext?: SsoSessionContext;
  userAgent?: string;
  ipAddress?: string;
  /** Requested lifetime in seconds. */
  expiresIn?: number;
}

/** Internal handle stays stable across token refreshes. */
export interface LogoutSession {
  id: string;
  ssoContext: SsoSessionContext | null;
}

export interface AuthenticatedSession {
  user: AuthenticatedSessionUser;
  session: LogoutSession;
}

/** What a user may see about one of their live sessions. Never carries the token. */
export interface UserSessionSummary {
  userId: number;
  userAgent: string | null;
  ipAddress: string | null;
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface SessionStats {
  totalActiveSessions: number;
  expiredSessions: number;
}

/** Identifies the sessions an identity provider ended (SSO back-channel / single logout). */
export type SsoSessionSelector =
  | { protocol: 'OIDC'; providerId: number; issuer: string; subject?: string; sid?: string; issuedBefore?: number }
  | {
      protocol: 'SAML';
      providerId: number;
      issuer?: string;
      nameID: string;
      nameIDFormat?: string;
      nameQualifier?: string;
      spNameQualifier?: string;
      sessionIndexes?: string[];
      issuedBefore?: number;
    };

/** Delivery receipt that makes a logout notification idempotent. */
export interface SsoLogoutReceipt {
  key: string;
  /** Epoch milliseconds the receipt is retained until. */
  expiresAt: number;
  /** Unsigned notifications require a match to bound retained receipts by revoked active sessions. */
  requireMatch?: boolean;
}
