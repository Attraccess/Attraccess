import type { UserContact, UserProfile } from '@attraccess/application-models';
import type { User } from '@attraccess/database-entities';

/** Maps a user row to the public profile. Nothing private is copied. */
export function toUserProfile(user: User): UserProfile {
  return {
    id: user.id,
    username: user.username,
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
