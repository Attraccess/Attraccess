/** The fields of a user that are safe to show to other users and administrators. */
export interface UserProfile {
  id: number;
  username: string;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
}

/** A public profile plus the email address, for flows that send mail. Never mapped into a response. */
export interface UserContact extends UserProfile {
  email: string;
}

/**
 * A user as the application stores it, including the fields that must never leave the server (email, tokens,
 * lockout state). Responses are built from `UserProfile` through an explicit mapper, never from this record.
 */
export interface UserRecord extends UserProfile {
  email: string;
  emailVerificationToken: string | null;
  emailVerificationTokenExpiresAt: Date | null;
  passwordResetToken: string | null;
  passwordResetTokenExpiresAt: Date | null;
  lastUsernameChangeAt: Date | null;
  lockedUntil: Date | null;
  failedLoginAttempts: number;
  firstFailedLoginAt: Date | null;
  deleteAccountToken: string | null;
  deleteAccountTokenExpiresAt: Date | null;
  deleteAccountRequestedAt: Date | null;
  nfcKeySeedToken: string | null;
}
