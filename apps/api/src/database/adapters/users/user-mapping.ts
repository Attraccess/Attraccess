import type {
  AccountCredentialRecord,
  UserAccount,
  UserContact,
  UserProfile,
  UserRecord,
} from '@attraccess/application-models';
import type { AuthenticationDetail, User } from '@attraccess/database-entities';
import { toUserRoleRecord } from './typeorm-rbac.store';

/** Maps a user row to the public profile. Nothing private is copied. */
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    locale: user.locale,
    dateTimeLocale: user.dateTimeLocale ?? null,
    isEmailVerified: user.isEmailVerified,
    isDisabled: user.isDisabled,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    deletedAt: user.deletedAt ?? null,
    externalIdentifier: user.externalIdentifier ?? null,
    creditBalance: user.creditBalance,
    billingFactor: user.billingFactor,
  };
}

/** The profile plus the email address, for flows that send mail. */
export function toUserContact(user: User): UserContact {
  return { ...toUserProfile(user), email: user.email };
}

/** The whole row, private columns included. Only the user store and services use it, never a response. */
export function toUserRecord(user: User): UserRecord {
  return {
    ...toUserContact(user),
    emailVerificationToken: user.emailVerificationToken ?? null,
    emailVerificationTokenExpiresAt: user.emailVerificationTokenExpiresAt ?? null,
    passwordResetToken: user.passwordResetToken ?? null,
    passwordResetTokenExpiresAt: user.passwordResetTokenExpiresAt ?? null,
    lastUsernameChangeAt: user.lastUsernameChangeAt ?? null,
    lockedUntil: user.lockedUntil ?? null,
    failedLoginAttempts: user.failedLoginAttempts,
    firstFailedLoginAt: user.firstFailedLoginAt ?? null,
    deleteAccountToken: user.deleteAccountToken ?? null,
    deleteAccountTokenExpiresAt: user.deleteAccountTokenExpiresAt ?? null,
    deleteAccountRequestedAt: user.deleteAccountRequestedAt ?? null,
    nfcKeySeedToken: user.nfcKeySeedToken ?? null,
  };
}

function toAccountCredential(detail: AuthenticationDetail): AccountCredentialRecord {
  return {
    id: detail.id,
    userId: detail.userId,
    type: detail.type,
    providerType: detail.providerType ?? null,
    providerId: detail.providerId ?? null,
    ssoSubject: detail.ssoSubject ?? null,
  };
}

/** A user row with the relations that were loaded. Relations that were not loaded stay absent. */
export function toUserAccount(user: User): UserAccount {
  return {
    ...toUserRecord(user),
    ...(user.authenticationDetails
      ? { authenticationDetails: user.authenticationDetails.map(toAccountCredential) }
      : {}),
    ...(user.userRoles ? { userRoles: user.userRoles.map(toUserRoleRecord) } : {}),
  };
}
