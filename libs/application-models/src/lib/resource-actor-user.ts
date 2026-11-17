/**
 * The account fields that resource features show next to an action (who created, resolved or completed
 * something). Plain data: no secrets, tokens, e-mail address or lockout state.
 */
export interface ResourceActorUser {
  id: number;
  username: string;
  locale: string;
  dateTimeLocale: string | null;
  isEmailVerified: boolean;
  isDisabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  externalIdentifier: string | null;
  creditBalance: number;
  billingFactor: number;
}

/** A user a notification is addressed to. The dispatcher reads the identity, the address and the locale. */
export interface ResourceNotificationRecipient {
  id: number;
  username: string;
  email: string;
  locale: string;
}
